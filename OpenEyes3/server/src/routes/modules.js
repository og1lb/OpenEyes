import multipart from '@fastify/multipart'
import { audit, db } from '../db.js'
import { env } from '../env.js'
import { LOOKUPS, LookupError, NEEDS_KEY } from '../lookups.js'
import { quotaState, release, reserve } from '../usage.js'
import { attachSession, checkCsrf, checkOrigin, requireAccess } from '../security/guards.js'

const MAX_FIELDS = 16
const MAX_FILE_BYTES = 10 * 1024 * 1024
const KEY = /^[a-z][a-zA-Z0-9_]{0,31}$/
const UPSTREAM_TIMEOUT_MS = 25000

function redactSensitive(value, key='') {
  const k=String(key).toLowerCase();
  if (/(password|passwd|passcode|secret|token|access[_-]?key|private[_-]?key|cookie|session)/i.test(k)) return '[REDACTED]';
  if (Array.isArray(value)) return value.slice(0,100).map((v)=>redactSensitive(v,key));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).slice(0,100).map(([k,v])=>[k,redactSensitive(v,k)]));
  return value;
}

function providerFor(moduleId) {
  const direct = env.apiProviders?.[moduleId];
  return direct?.url ? direct : (env.databaseApiUrl ? { url: env.databaseApiUrl, key: env.databaseApiToken } : null);
}

function databaseProvider() {
  return env.databaseApiUrl ? { url: env.databaseApiUrl, key: env.databaseApiToken } : null;
}

function isSensitiveKey(key) {
  return /(password|passwd|passcode|secret|token|access[_-]?key|private[_-]?key|cookie|session|authorization|credential)/i.test(String(key));
}

function normalizeDatabaseKey(key) {
  return String(key)
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*$/, '')
}

function parseDatabaseText(text, out = Object.create(null)) {
  const source = String(text || '').replace(/\r/g, '');
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const cleaned = line.replace(/^\{|\}$/g, '').trim();
    if (!cleaned) continue;

    // Supports: "IP: 1.2.3.4", "Discord ID 2: ...", "123:1.2.3.4"
    const match = cleaned.match(/^([^:=]{1,100})\s*[:=]\s*(.+)$/);
    if (!match) continue;

    const key = normalizeDatabaseKey(match[1]);
    const value = match[2].trim().replace(/[,}]+$/g, '').trim();
    if (!key || !value || isSensitiveKey(key)) continue;

    // Strip Discord mention formatting while retaining the identifier.
    const discordMention = value.match(/^<@!?(\d{15,22})>$/);
    out[key] = discordMention ? discordMention[1] : value.slice(0, 4096);
  }

  return out;
}

function collectDatabaseFields(value, out = Object.create(null), prefix = '') {

  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((item, index) => collectDatabaseFields(item, out, prefix ? `${prefix}.${index}` : String(index)));
    return out;
  }
  if (!value || typeof value !== 'object') return out;

  for (const [key, child] of Object.entries(value).slice(0, 200)) {
    if (isSensitiveKey(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object') {
      collectDatabaseFields(child, out, path);
    } else if (child !== undefined && child !== null) {
      out[path] = typeof child === 'string' ? child.slice(0, 4096) : child;
    }
  }
  return out;
}

async function runDatabaseApi(provider, moduleId, values) {
  if (!provider?.url) return { fields: {}, status: 'not_configured' };

  let url;
  try { url = new URL(provider.url); } catch {
    throw new LookupError('Configured Database API URL is invalid.', 500);
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new LookupError('Configured Database API URL must use HTTPS.', 400);
  }

  const res = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(provider.key ? { authorization: `Bearer ${provider.key}` } : {}),
    },
    body: JSON.stringify({ moduleId, values }),
  });

  const text = await res.text();
  if (!res.ok) throw new LookupError(`Database API returned HTTP ${res.status}.`, 502);
  if (text.length > 2 * 1024 * 1024) throw new LookupError('Database API returned too much data.', 502);

  let json;
  try { json = JSON.parse(text); } catch {
    throw new LookupError('Database API did not return JSON.', 502);
  }

  const payload = json?.data ?? json?.results ?? json?.result ?? json?.blocks ?? json;
  return {
    fields: collectDatabaseFields(payload),
    status: 'ok',
    provider: url.origin,
  };
}

async function runConfiguredProvider(provider, moduleId, values) {
  let url; try { url=new URL(provider.url); } catch { throw new LookupError('Configured API URL is invalid.',500); }
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new LookupError('Configured API URL must use HTTPS.',400);

  // Discord's official REST API is not a generic OpenEyes POST endpoint.
  // When API_DISCORD_LOOKUP_URL points at discord.com/api/v10, use the
  // documented GET /users/{user.id} route with the configured bot token.
  if (moduleId === 'discord-lookup' && url.hostname === 'discord.com') {
    const query = String(values.query || '').trim();
    if (!/^\d{17,20}$/.test(query)) {
      throw new LookupError('The official Discord API lookup requires a numeric Discord user ID. Use a custom lookup provider if you need username search.',400);
    }
    const base = url.toString().replace(/\/$/, '');
    const res = await fetch(`${base}/users/${encodeURIComponent(query)}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        accept: 'application/json',
        'user-agent': 'OpenEyes/1.0',
        ...(provider.key ? { authorization: `Bot ${provider.key}` } : {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) throw new LookupError('Discord rejected the bot token. Regenerate the token and update API_DISCORD_LOOKUP_KEY.',502);
      if (res.status === 404) throw new LookupError('Discord user not found.',404);
      if (res.status === 429) throw new LookupError('Discord rate-limited the lookup. Try again shortly.',429);
      throw new LookupError(`Discord API returned HTTP ${res.status}.`,502);
    }
    if (text.length > 2*1024*1024) throw new LookupError('Discord API returned too much data.',502);
    let json; try { json=JSON.parse(text); } catch { throw new LookupError('Discord API did not return JSON.',502); }
    return {
      blocks: redactSensitive({
        account: {
          id: json.id,
          username: json.username,
          global_name: json.global_name || '—',
          discriminator: json.discriminator || '0',
          bot: Boolean(json.bot),
          system: Boolean(json.system),
          avatar: json.avatar || '—',
          banner: json.banner || '—',
          accent_color: json.accent_color ?? '—',
          public_flags: json.public_flags ?? 0,
        },
      }),
      meta: { source: 'discord-api', provider: url.origin },
    };
  }

  const res=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',accept:'application/json',...(provider.key?{authorization:`Bearer ${provider.key}`}:{})},body:JSON.stringify({moduleId,values})});
  const text=await res.text(); if(!res.ok) throw new LookupError(`Configured API returned HTTP ${res.status}.`,502); if(text.length>2*1024*1024) throw new LookupError('Configured API returned too much data.',502);
  let json; try { json=JSON.parse(text); } catch { throw new LookupError('Configured API did not return JSON.',502); }
  const blocks = redactSensitive(json?.blocks ?? json);
  if (moduleId === 'discord-lookup' && values.history && blocks && typeof blocks === 'object' && !Array.isArray(blocks)) {
    if (!Object.prototype.hasOwnProperty.call(blocks, 'history')) {
      blocks.history = [{ name: 'History unavailable', changed: 'The connected provider did not return name-history data. Discord official API does not expose historical usernames.' }];
    } else if (Array.isArray(blocks.history) && blocks.history.length === 0) {
      blocks.history = [{ name: 'No history returned', changed: 'The connected provider returned no historical usernames for this ID.' }];
    }
  }
  return {blocks, meta:{source:'configured-api',provider:url.origin}};
}

function cleanValue(value) {
  if (typeof value === 'string') return value.length <= 2048 ? value : null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) {
    if (value.length > 16) return null
    return value.every((v) => typeof v === 'string' && v.length <= 32) ? value : null
  }
  return null
}

function cleanValues(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const entries = Object.entries(body)
  if (entries.length > MAX_FIELDS) return null
  const out = Object.create(null)
  for (const [key, value] of entries) {
    if (!KEY.test(key)) return null
    const clean = cleanValue(value)
    if (clean === null) return null
    out[key] = clean
  }
  return out
}

async function readMultipart(request) {
  const out = Object.create(null)
  let fields = 0
  for await (const part of request.parts()) {
    if (++fields > MAX_FIELDS || !KEY.test(part.fieldname)) {
      if (part.file) part.file.resume()
      return null
    }
    if (part.type === 'file') {
      if (out.file) {
        part.file.resume()
        return null
      }
      const data = await part.toBuffer()
      if (part.file.truncated) return null
      out.file = { data, filename: part.filename, mimetype: part.mimetype }
    } else {
      const clean = cleanValue(String(part.value))
      if (clean === null) return null
      out[part.fieldname] = clean
    }
  }
  return out
}

function upstream() {
  if (!env.moduleUpstreamUrl) return null
  try {
    const url = new URL(env.moduleUpstreamUrl)
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
    if (url.protocol !== 'https:' && !local) return null
    return url
  } catch {
    return null
  }
}

async function runUpstream(target, moduleId, values) {
  const res = await fetch(new URL('/run', target), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(env.moduleUpstreamToken ? { authorization: `Bearer ${env.moduleUpstreamToken}` } : {}),
    },
    body: JSON.stringify({ moduleId, values }),
  })
  const text = await res.text()
  if (!res.ok) throw new LookupError('The module source refused the request.', 502)
  if (text.length > 2 * 1024 * 1024) throw new LookupError('The module source answered with too much data.', 502)
  try {
    return JSON.parse(text)
  } catch {
    throw new LookupError('The module source answered with something that is not JSON.', 502)
  }
}

export default async function moduleRoutes(app) {
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: MAX_FIELDS, fieldSize: 2048, parts: MAX_FIELDS + 1 },
  })

  app.post('/api/run/:moduleId', {
    schema: {
      params: {
        type: 'object',
        required: ['moduleId'],
        additionalProperties: false,
        properties: { moduleId: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' } },
      },
    },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      attachSession(request)
      if (!checkOrigin(request) || !checkCsrf(request)) {
        return reply.code(403).send({ code: 'csrf', message: 'Request rejected.' })
      }

      const gate = await requireAccess(request, reply)
      if (!gate) return
      const userId = gate.session.userId
      const { moduleId } = request.params

      const local = Object.prototype.hasOwnProperty.call(LOOKUPS, moduleId) ? LOOKUPS[moduleId] : null
      const configured = !local ? providerFor(moduleId) : null
      const database = databaseProvider()
      const remote = !local && !configured && Object.prototype.hasOwnProperty.call(NEEDS_KEY, moduleId) ? upstream() : null
      if (!local && !remote && !configured) {
        const need = Object.prototype.hasOwnProperty.call(NEEDS_KEY, moduleId) ? NEEDS_KEY[moduleId] : null
        return reply.code(need ? 501 : 404).send({
          code: need ? 'not_available' : 'not_found',
          message: need ? `This module needs ${need}, which is not connected.` : 'No such module.',
        })
      }

      const values = request.isMultipart() ? await readMultipart(request) : cleanValues(request.body)
      if (!values) return reply.code(400).send({ code: 'bad_request', message: 'That input was not in the shape we accept.' })
      if (values.file && moduleId !== 'metadata') {
        return reply.code(400).send({ code: 'bad_request', message: 'This module does not take a file.' })
      }

      const slot = reserve(userId)
      if (!slot.ok) {
        return reply.code(429).send({
          code: 'quota_exceeded',
          message: slot.state.limit
            ? `Daily limit reached. Your plan allows ${slot.state.limit} searches a day.`
            : 'Your plan does not include searches.',
          quota: slot.state,
        })
      }

      const startedAt = Date.now()
      let result
      let databaseResult = { fields: {}, status: 'not_configured' }

      try {
        // The Database API is an enrichment source for EVERY search, including
        // modules that already have a local lookup implementation.
        // Its failure is non-fatal so public DNS/IP/etc. lookups still work.
        if (database) {
          try {
            databaseResult = await runDatabaseApi(database, moduleId, values)
          } catch (err) {
            request.log.warn({ err: err.message, moduleId }, 'database enrichment failed')
            databaseResult = { fields: {}, status: 'error', error: 'Database API unavailable' }
          }
        }

        result = local ? await local(values) : configured ? await runConfiguredProvider(configured, moduleId, values) : await runUpstream(remote, moduleId, values)
      } catch (err) {
        release(userId, slot.day)
        if (err instanceof LookupError) {
          return reply.code(err.statusCode).send({ code: err.statusCode === 400 ? 'bad_input' : 'lookup_failed', message: err.message })
        }
        request.log.warn({ err: err.message, moduleId }, 'lookup failed')
        db.prepare('INSERT INTO search_history (id,user_id,tool,target,started_at,finished_at,duration_ms,result_state,metadata) VALUES (?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),userId,moduleId,String(values.email||values.username||values.domain||values.ip||values.asn||values.query||'').slice(0,160),startedAt,Date.now(),Date.now()-startedAt,'error',JSON.stringify({error:err.message}))
        return reply.code(502).send({ code: 'lookup_failed', message: 'The lookup failed.' })
      }

      db.prepare('INSERT INTO search_history (id,user_id,tool,target,started_at,finished_at,duration_ms,result_state,metadata) VALUES (?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),userId,moduleId,String(values.email||values.username||values.domain||values.ip||values.asn||values.query||'').slice(0,160),startedAt,Date.now(),Date.now()-startedAt,'success',JSON.stringify({source:local?'live':'upstream'}))
      audit('module.run', { actor: userId, subject: moduleId })
      reply.header('cache-control', 'no-store')
      const blocks = { ...(result?.blocks ?? {}) }
      if (database) {
        blocks.database = databaseResult.fields
      }

      reply.send({
        blocks,
        meta: {
          source: local ? 'live' : configured ? 'configured-api' : 'upstream',
          databaseApi: database ? databaseResult.status : 'not_configured',
          databaseProvider: databaseResult.provider,
        },
        quota: quotaState(userId),
      })
    },
  })
}
