import { createServer } from 'node:http'
import { readQuota } from './quota-service.mjs'

const port = Number(process.env.PORT || 4319)

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
  if (request.method === 'GET' && url.pathname === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ ok: true }))
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/quota') {
    const quota = await readQuota({ force: url.searchParams.get('force') === '1' })
    response.writeHead(quota.available ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(quota))
    return
  }
  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ message: 'Quota Tide 只提供本机只读额度桥。' }))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Quota Tide native bridge is listening at http://127.0.0.1:${port}`)
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
