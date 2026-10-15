import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const serverDir = resolve(root, 'server')
const envFile = resolve(serverDir, '.env')
const apiEnvFile = resolve(serverDir, 'api.env')
const viteEntry = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')

function ensureDevEnv() {
  mkdirSync(resolve(serverDir, 'data'), { recursive: true })
  if (existsSync(envFile)) return
  const secret = randomBytes(32).toString('hex')
  const env = `NODE_ENV=development\nHOST=127.0.0.1\nPORT=8000\nPUBLIC_URL=http://localhost:5180\nTRUST_PROXY=false\nLOG_LEVEL=info\nDATABASE_FILE=./data/openeyes.db\nSTATIC_DIR=../dist\nSESSION_SECRET=${secret}\nSESSION_IDLE_SECONDS=604800\nSESSION_ABSOLUTE_SECONDS=2592000\nCORS_ORIGINS=http://localhost:5180,http://127.0.0.1:5180\nOWNER_USERNAME=owner\nOWNER_PASSWORD=change-this-to-a-long-random-password\nOWNER_EMAIL=owner@example.com\nADMIN_USERNAMES=admin\nDISCORD_SHOP_URL=https://discord.com/\nVITE_DISCORD_SHOP_URL=https://discord.com/\nBTC_ENABLED=false\nLTC_ENABLED=false\nDATABASE_API_URL=\nDATABASE_API_TOKEN=\n`
  writeFileSync(envFile, env, { mode: 0o600 })
  console.log('[OpenEyes] Created server/.env for local development.')
}

function ensureApiEnv() {
  // Never rewrite an existing API configuration.
  if (existsSync(apiEnvFile)) return
  const template = resolve(serverDir, 'api.env.example')
  if (existsSync(template)) copyFileSync(template, apiEnvFile)
  else writeFileSync(apiEnvFile, '# OpenEyes per-tool API configuration\n', { mode: 0o600 })
  console.log('[OpenEyes] Created server/api.env from the example template.')
}

ensureDevEnv()
ensureApiEnv()

const children = []
let shuttingDown = false
function start(label, command, args, cwd) {
  // Do not use shell=true with process.execPath: Windows paths such as
  // "C:\Program Files\nodejs\node.exe" otherwise get split at the space.
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  })
  children.push({ label, child })
  child.on('error', (error) => {
    if (shuttingDown) return
    console.error(`[OpenEyes] Could not start ${label}: ${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    if (code !== 0) {
      console.error(`[OpenEyes] ${label} stopped (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`)
      shutdown(code || 1)
    }
  })
  return child
}
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const { child } of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 300).unref()
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start('backend', process.execPath, ['src/index.js'], serverDir)
start('frontend', process.execPath, [viteEntry, '--host', '127.0.0.1'], root)
console.log('\nOpenEyes development environment:')
console.log('  Frontend: http://localhost:5180')
console.log('  Backend:  http://127.0.0.1:8000')
console.log('  Owner:    owner / change-this-to-a-long-random-password\n')
