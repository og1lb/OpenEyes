import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'

import { env } from './env.js'
import { accessFor } from './entitlements.js'
import { allowedOrigins, attachSession } from './security/guards.js'
import authRoutes from './routes/auth.js'
import accountRoutes from './routes/account.js'
import billingRoutes from './routes/billing.js'
import moduleRoutes from './routes/modules.js'
import adminRoutes from './routes/admin.js'
import earlyAccessRoutes from './routes/earlyAccess.js'
import workspaceRoutes from './routes/workspace.js'
import { adminState } from './security/admin.js'

export async function buildApp({ logger } = {}) {
  const app = Fastify({
    logger: logger ?? { level: env.logLevel },
    trustProxy: env.trustProxy,
    bodyLimit: 16 * 1024,
    genReqId: () => crypto.randomUUID(),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  })

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https://cdn.discordapp.com'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        ...(env.isProduction ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
  })

  await app.register(cookie, {
    secret: env.sessionSecret,
    parseOptions: { path: '/', sameSite: 'lax', httpOnly: true, secure: env.isProduction },
  })

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({ code: 'rate_limited', message: 'Too many requests.' }),
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('permissions-policy', 'geolocation=(), microphone=(), camera=(), payment=()')

    const origin = request.headers.origin
    if (origin && allowedOrigins().has(origin)) {
      reply.header('access-control-allow-origin', origin)
      reply.header('access-control-allow-credentials', 'true')
      reply.header('vary', 'Origin')
    }
  })

  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500
    if (status >= 500) request.log.error({ err: error }, 'request failed')

    if (error.validation) {
      return reply.code(400).send({ code: 'bad_request', message: 'That request was not in the shape we accept.' })
    }

    reply.code(status).send({
      code: error.code || 'error',
      message: status >= 500 ? 'Something went wrong.' : error.message,
    })
  })

  app.get('/api/health', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => ({
    ok: true,
    service: 'openeyes',
  }))

  await app.register(authRoutes)
  await app.register(accountRoutes)
  await app.register(billingRoutes)
  await app.register(moduleRoutes)
  await app.register(adminRoutes)
  await app.register(earlyAccessRoutes)
  await app.register(workspaceRoutes)

  async function panelHandler(request, reply) {
    const session = attachSession(request)
    if (!session) return reply.redirect('/?auth=required#terms', 303)
    const access = await accessFor(session.userId)
    if (!access.allowed) return reply.redirect(`/?gate=${encodeURIComponent(access.reason)}`, 303)
    reply.header('cache-control', 'no-store')
    return reply.sendFile('index.html')
  }

  if (env.staticDir) {
    const root = resolve(env.staticDir)
    if (!existsSync(root)) throw new Error(`STATIC_DIR does not exist: ${root}`)

    await app.register(fastifyStatic, {
      root,
      wildcard: false,
      index: false,
      dotfiles: 'deny',
      maxAge: '1h',
    })

    async function adminHandler(request, reply) {
      attachSession(request)
      if (!adminState(request)) {
        reply.header('cache-control', 'no-store')
        return reply.code(404).send({ code: 'not_found', message: 'Not found.' })
      }
      reply.header('cache-control', 'no-store')
      return reply.sendFile('index.html')
    }

    app.get('/panel', panelHandler)
    app.get('/panel/*', panelHandler)
    app.get('/admin', adminHandler)
    app.get('/admin/*', adminHandler)
    app.get('/', async (_request, reply) => reply.sendFile('index.html'))
  }

  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ code: 'not_found', message: 'No such endpoint.' })
    }
    if (!env.staticDir) return reply.code(404).send({ code: 'not_found', message: 'Not found.' })
    return reply.sendFile('index.html')
  })

  return app
}
