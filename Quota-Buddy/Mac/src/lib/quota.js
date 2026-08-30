export const demoQuota = {
  available: true,
  source: 'demo',
  observedAt: new Date().toISOString(),
  freshness: 'live',
  primary: {
    name: '5 小时窗口',
    windowMinutes: 300,
    usedPercent: 37,
    remainingPercent: 63,
    resetsAt: new Date(Date.now() + 2 * 60 * 60 * 1000 + 17 * 60 * 1000).toISOString(),
  },
  secondary: {
    name: '每周窗口',
    windowMinutes: 10_080,
    usedPercent: 18,
    remainingPercent: 82,
    resetsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString(),
  },
  resetCredits: 3,
  message: '',
}

export function clampPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(100, Math.max(0, Math.round(number)))
}

export function formatCountdown(resetAt, now = Date.now()) {
  const remaining = Math.max(0, Date.parse(resetAt) - now)
  const seconds = Math.floor(remaining / 1000)
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const secs = seconds % 60

  if (days > 0) return `${days} 天 ${hours.toString().padStart(2, '0')} 时`
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function formatResetAt(resetAt) {
  if (!resetAt || Number.isNaN(Date.parse(resetAt))) return '暂不可用'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(resetAt))
}

export function formatUpdatedAt(observedAt, now = Date.now()) {
  if (!observedAt) return '正在寻找信号'
  const seconds = Math.max(0, Math.floor((now - Date.parse(observedAt)) / 1_000))
  if (seconds < 8) return '刚刚校准'
  if (seconds < 60) return `${seconds} 秒前校准`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分钟前校准`
}

export function quotaMood(primaryRemaining) {
  const remaining = clampPercent(primaryRemaining)
  if (remaining >= 70) return { name: 'aurora', label: '余裕', sentence: '今天的空气很充足，适合把难题拆开慢慢做。' }
  if (remaining >= 45) return { name: 'tide', label: '稳流', sentence: '节奏正在成形。把注意力留给真正想完成的事。' }
  if (remaining >= 21) return { name: 'amber', label: '收束', sentence: '把枝叶暂时收起，给最重要的一段思考留出空间。' }
  if (remaining >= 6) return { name: 'ember', label: '微光', sentence: '火还亮着。现在适合做一个清晰、短促的决定。' }
  return { name: 'eclipse', label: '静泊', sentence: '先停一停也没关系，窗口会在下一次潮汐里重新打开。' }
}

export function sourceLabel(source, freshness) {
  if (source === 'codex-app-server') return freshness === 'cached' ? '本机服务缓存' : 'Codex 本机服务'
  if (source === 'local-codex-recording') return '本机运行记录'
  if (source === 'demo') return '展示数据'
  return '等待本机信号'
}
