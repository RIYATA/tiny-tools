import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { open, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CACHE_TTL_MS = 15_000
const REQUEST_TIMEOUT_MS = 8_000
const LOG_TAIL_BYTES = 6 * 1024 * 1024

let cachedQuota = null
let cachedAt = 0

export class QuotaServiceError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'QuotaServiceError'
    this.cause = cause
  }
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeRateLimits(rateLimits, resetCredits, source) {
  const primary = rateLimits?.primary
  const secondary = rateLimits?.secondary
  const primaryUsed = safeNumber(primary?.usedPercent ?? primary?.used_percent)
  const secondaryUsed = safeNumber(secondary?.usedPercent ?? secondary?.used_percent)
  const primaryReset = safeNumber(primary?.resetsAt ?? primary?.reset_at)
  const secondaryReset = safeNumber(secondary?.resetsAt ?? secondary?.reset_at)

  if ([primaryUsed, secondaryUsed, primaryReset, secondaryReset].some((value) => value === null)) {
    throw new QuotaServiceError('Codex 返回的额度信息不完整。')
  }

  const asPercent = (value) => Math.min(100, Math.max(0, Math.round(value)))
  return {
    available: true,
    source,
    observedAt: new Date().toISOString(),
    primary: {
      name: '5 小时窗口',
      windowMinutes: safeNumber(primary?.windowMinutes ?? primary?.window_minutes) ?? 300,
      usedPercent: asPercent(primaryUsed),
      remainingPercent: asPercent(100 - primaryUsed),
      resetsAt: new Date(primaryReset * 1000).toISOString(),
    },
    secondary: {
      name: '每周窗口',
      windowMinutes: safeNumber(secondary?.windowMinutes ?? secondary?.window_minutes) ?? 10_080,
      usedPercent: asPercent(secondaryUsed),
      remainingPercent: asPercent(100 - secondaryUsed),
      resetsAt: new Date(secondaryReset * 1000).toISOString(),
    },
    resetCredits: resetCredits === null || resetCredits === undefined ? null : Math.max(0, Math.floor(Number(resetCredits))),
    message: '',
  }
}

function stopProcess(child) {
  if (!child || child.killed) return
  child.stdin?.end()
  child.kill('SIGTERM')
}

export function requestCodexQuota({ timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const output = createInterface({ input: child.stdout })
    let stderr = ''
    let finished = false
    let querySent = false

    const finish = (error, value) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      output.close()
      stopProcess(child)
      if (error) reject(error)
      else resolve(value)
    }

    const send = (payload) => child.stdin.write(`${JSON.stringify(payload)}\n`)
    const timer = setTimeout(() => {
      finish(new QuotaServiceError('读取 Codex 额度超时；请确认 Codex 桌面版已经登录。'))
    }, timeoutMs)

    child.once('error', (error) => {
      finish(new QuotaServiceError('无法启动本机 Codex 服务。', error))
    })
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000)
    })
    child.once('exit', (code) => {
      if (!finished && code !== 0) {
        finish(new QuotaServiceError(stderr.trim() || 'Codex 本机服务意外退出。'))
      }
    })
    output.on('line', (line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }

      if (message.id === 1) {
        if (message.error) {
          finish(new QuotaServiceError(message.error.message || 'Codex 本机服务初始化失败。'))
          return
        }
        if (!querySent && message.result) {
          querySent = true
          send({ method: 'initialized', params: {} })
          send({ method: 'account/rateLimits/read', id: 2, params: {} })
        }
        return
      }

      if (message.id !== 2) return
      if (message.error) {
        finish(new QuotaServiceError(message.error.message || 'Codex 拒绝了额度读取请求。'))
        return
      }
      try {
        const rateLimits = message.result?.rateLimits
        const credits = message.result?.rateLimitResetCredits?.availableCount
        finish(null, normalizeRateLimits(rateLimits, credits, 'codex-app-server'))
      } catch (error) {
        finish(error instanceof QuotaServiceError ? error : new QuotaServiceError('无法解析 Codex 额度响应。', error))
      }
    })

    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: { name: 'quota-tide', title: 'Quota Tide', version: '0.1.0' },
        capabilities: {},
      },
    })
  })
}

function parseResetCredits(text) {
  const matches = [...text.matchAll(/"(?:availableCount|ResetCredits)"\s*:\s*(\d+)/g)]
  return matches.length ? Number(matches.at(-1)[1]) : null
}

export function parseQuotaFromLogText(text) {
  const candidates = []
  const underscores = /"primary"\s*:\s*\{[^{}]{0,1000}?"used_percent"\s*:\s*(\d+(?:\.\d+)?)[^{}]{0,1000}?"reset_at"\s*:\s*(\d+)[^{}]*?\}\s*,\s*"secondary"\s*:\s*\{[^{}]{0,1000}?"used_percent"\s*:\s*(\d+(?:\.\d+)?)[^{}]{0,1000}?"reset_at"\s*:\s*(\d+)/gs
  const camels = /"primary"\s*:\s*\{[^{}]{0,1000}?"usedPercent"\s*:\s*(\d+(?:\.\d+)?)[^{}]{0,1000}?"resetsAt"\s*:\s*(\d+)[^{}]*?\}\s*,\s*"secondary"\s*:\s*\{[^{}]{0,1000}?"usedPercent"\s*:\s*(\d+(?:\.\d+)?)[^{}]{0,1000}?"resetsAt"\s*:\s*(\d+)/gs

  for (const pattern of [underscores, camels]) {
    for (const match of text.matchAll(pattern)) {
      try {
        candidates.push(normalizeRateLimits({
          primary: { usedPercent: Number(match[1]), resetsAt: Number(match[2]) },
          secondary: { usedPercent: Number(match[3]), resetsAt: Number(match[4]) },
        }, parseResetCredits(text), 'local-codex-recording'))
      } catch {
        // A SQLite page can be truncated in the middle of a record; skip it.
      }
    }
  }

  return candidates.sort((a, b) => Date.parse(b.secondary.resetsAt) - Date.parse(a.secondary.resetsAt))[0] ?? null
}

async function readTail(path) {
  const info = await stat(path)
  const length = Math.min(info.size, LOG_TAIL_BYTES)
  const buffer = Buffer.alloc(length)
  const handle = await open(path, 'r')
  try {
    await handle.read(buffer, 0, length, Math.max(0, info.size - length))
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function readLocalQuotaFallback() {
  const codexHome = join(homedir(), '.codex')
  const paths = [
    join(codexHome, 'logs_2.sqlite-wal'),
    join(codexHome, 'state_5.sqlite-wal'),
    join(codexHome, 'logs_2.sqlite'),
    join(codexHome, 'state_5.sqlite'),
  ]
  const candidates = []

  for (const path of paths) {
    try {
      const parsed = parseQuotaFromLogText(await readTail(path))
      if (parsed) candidates.push(parsed)
    } catch {
      // Missing or currently locked local files are expected fallback conditions.
    }
  }

  if (!candidates.length) {
    throw new QuotaServiceError('尚未找到本机额度记录；请先在 Codex 中完成一次请求后重试。')
  }
  return candidates.sort((a, b) => Date.parse(b.secondary.resetsAt) - Date.parse(a.secondary.resetsAt))[0]
}

export async function readQuota({ force = false } = {}) {
  const now = Date.now()
  if (!force && cachedQuota && now - cachedAt < CACHE_TTL_MS) {
    return { ...cachedQuota, freshness: 'cached' }
  }

  try {
    const quota = await requestCodexQuota()
    cachedQuota = quota
    cachedAt = now
    return { ...quota, freshness: 'live' }
  } catch (primaryError) {
    try {
      const quota = await readLocalQuotaFallback()
      cachedQuota = quota
      cachedAt = now
      return { ...quota, freshness: 'fallback', warning: primaryError.message }
    } catch (fallbackError) {
      const message = fallbackError.message || primaryError.message || '暂时无法读取额度。'
      return {
        available: false,
        source: 'unavailable',
        observedAt: new Date().toISOString(),
        message,
        primary: null,
        secondary: null,
        resetCredits: null,
        freshness: 'offline',
      }
    }
  }
}
