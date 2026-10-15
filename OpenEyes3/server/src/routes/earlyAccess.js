import { db, audit } from '../db.js'
import { keyedHash, randomId, sha256 } from '../security/crypto.js'

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/

const insertSignup = db.prepare(
  'INSERT INTO early_access (id, email, email_hash, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)',
)
const selectByHash = db.prepare('SELECT id FROM early_access WHERE email_hash = ?')

function reference() {
  return `IS-${Date.now().toString(36).toUpperCase()}-${randomId(2).toUpperCase()}`
}

export default async function earlyAccessRoutes(app) {
  app.post('/api/early-access', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', minLength: 6, maxLength: 254 },
          submittedAt: { type: 'string', maxLength: 40 },
        },
      },
    },
    handler: async (request, reply) => {
      const email = request.body.email.trim().toLowerCase()
      if (!EMAIL.test(email)) {
        return reply.code(400).send({ code: 'bad_email', message: 'That address does not look right.' })
      }

      const hash = sha256(email)
      const existing = selectByHash.get(hash)
      if (existing) return reply.send({ id: existing.id })

      const id = reference()
      insertSignup.run(id, email, hash, Date.now(), request.ip ? keyedHash(request.ip, 'ip') : null)
      audit('signup.filed', { subject: id })
      reply.send({ id })
    },
  })
}
