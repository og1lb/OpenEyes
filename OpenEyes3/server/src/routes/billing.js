import { createInvoice, enabledAssets, invoiceFor } from '../billing.js'
import { PLAN_ID_PATTERN, publicPlans } from '../plans.js'
import { attachSession, checkCsrf, checkOrigin, requireSession } from '../security/guards.js'

const invoiceBody = {
  type: 'object',
  required: ['planId', 'asset'],
  additionalProperties: false,
  properties: {
    planId: { type: 'string', pattern: PLAN_ID_PATTERN },
    asset: { type: 'string', enum: ['btc', 'ltc'] },
  },
}

const invoiceParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', pattern: '^[0-9a-f]{32}$' } },
}

export default async function billingRoutes(app) {
  app.get('/api/billing/plans', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (_request, reply) => {
      reply.send({ plans: publicPlans(), assets: enabledAssets() })
    },
  })

  app.post('/api/billing/invoice', {
    schema: { body: invoiceBody },
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    handler: async (request, reply) => {
      attachSession(request)
      if (!checkOrigin(request) || !checkCsrf(request)) {
        return reply.code(403).send({ code: 'csrf', message: 'Request rejected.' })
      }
      const session = requireSession(request, reply)
      if (!session) return

      const invoice = await createInvoice(session.userId, request.body.planId, request.body.asset)
      reply.send({ invoice })
    },
  })

  app.get('/api/billing/invoice/:id', {
    schema: { params: invoiceParams },
    config: { rateLimit: { max: 240, timeWindow: '5 minutes' } },
    handler: async (request, reply) => {
      const session = requireSession(request, reply)
      if (!session) return

      const invoice = invoiceFor(session.userId, request.params.id)
      if (!invoice) return reply.code(404).send({ code: 'not_found', message: 'No such invoice.' })
      reply.send({ invoice })
    },
  })
}
