import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readQuota } from './quota-service.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
const port = Number(process.env.PORT || 4318)
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function respondJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? '/index.html' : pathname
  const target = normalize(join(dist, requested))
  const safeTarget = target.startsWith(`${dist}/`) || target === dist ? target : null
  const file = safeTarget && existsSync(safeTarget) ? safeTarget : join(dist, 'index.html')

  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('请先运行 npm run build，再启动 Quota Tide。')
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
  if (request.method === 'GET' && url.pathname === '/api/health') {
    respondJson(response, 200, { ok: true, time: new Date().toISOString() })
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/quota') {
    const quota = await readQuota({ force: url.searchParams.get('force') === '1' })
    respondJson(response, quota.available ? 200 : 503, quota)
    return
  }
  if (request.method !== 'GET') {
    respondJson(response, 405, { message: '只允许读取操作。' })
    return
  }
  await serveStatic(url.pathname, response)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Quota Tide is listening at http://127.0.0.1:${port}`)
})

function shutdown() {
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
