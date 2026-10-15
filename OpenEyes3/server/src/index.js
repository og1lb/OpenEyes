import { assertEnv, env } from './env.js'
import { audit, closeDb } from './db.js'
import { buildApp } from './app.js'
import { initChains, watchTick } from './billing.js'
import { reconcileAll } from './entitlements.js'
import { pruneSessions } from './security/sessions.js'
import { pruneUsage } from './usage.js'

assertEnv()
initChains()

const app = await buildApp()
await app.listen({ host: env.host, port: env.port })

audit('server.start', { detail: { publicUrl: env.publicUrl } })

const timers = []

function every(seconds, name, fn) {
  const run = async () => {
    try {
      await fn()
    } catch (err) {
      app.log.error({ err: err.message, job: name }, 'job failed')
    }
  }
  const timer = setInterval(run, seconds * 1000)
  timer.unref()
  timers.push(timer)
  run()
}

let stopping = false

async function shutdown(signal) {
  if (stopping) return
  stopping = true
  app.log.info({ signal }, 'shutting down')
  for (const timer of timers) clearInterval(timer)
  try {
    await app.close()
  } finally {
    closeDb()
    process.exit(0)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

every(env.watchIntervalSeconds, 'watch', () => watchTick(app.log))
every(env.reconcileIntervalSeconds, 'reconcile', () => reconcileAll())
every(3600, 'prune', () => {
  pruneSessions()
  pruneUsage()
})
