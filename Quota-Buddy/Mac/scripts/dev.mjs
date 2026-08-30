import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const api = spawn(process.execPath, [resolve(root, 'server/index.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: '4319' },
  stdio: 'inherit',
})
const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4318'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

function stop(code = 0) {
  api.kill('SIGTERM')
  vite.kill('SIGTERM')
  process.exit(code)
}

api.on('exit', (code) => {
  if (code && code !== 0) stop(code)
})
vite.on('exit', (code) => {
  if (code && code !== 0) stop(code)
})
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
