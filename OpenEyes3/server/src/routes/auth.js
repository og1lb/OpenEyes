import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db, audit } from '../db.js'
import { createSession, cookieOptions, SESSION_COOKIE, CSRF_COOKIE, csrfCookieOptions, revokeSession } from '../security/sessions.js'
import { attachSession, checkCsrf, checkOrigin, requireSession } from '../security/guards.js'
import { env } from '../env.js'
import { ensureFreeEntitlement } from '../entitlements.js'
import { authorizeUrl, exchangeCode, fetchIdentity, revokeToken } from '../discord/api.js'
import { pkcePair, randomToken, sha256 } from '../security/crypto.js'
import { quotaState } from '../usage.js'

const selectByLogin=db.prepare('SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)')
const selectByUsername=db.prepare('SELECT id FROM users WHERE lower(username)=lower(?)')
const selectByEmail=db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)')
const insertUser=db.prepare('INSERT INTO users (id,username,email,password_hash,role,global_name,created_at,updated_at,last_login_at,last_ip) VALUES (?,?,?,?,?,?,?,?,?,?)')
const updateLogin=db.prepare('UPDATE users SET last_login_at=?,last_ip=?,updated_at=? WHERE id=?')
const updateRole=db.prepare('UPDATE users SET role=?,updated_at=? WHERE id=?')
function hashPassword(password){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`}
function verifyPassword(password,encoded){try{const [,salt,hex]=String(encoded||'').split(':');if(!salt||!hex)return false;const a=Buffer.from(hex,'hex');const b=scryptSync(password,salt,64);return a.length===b.length&&timingSafeEqual(a,b)}catch{return false}}
function validUsername(v){return typeof v==='string'&&/^[a-zA-Z0-9_.-]{3,32}$/.test(v.trim())}
function validEmail(v){return typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())&&v.length<=160}
function roleFor(username){return env.adminUsernames.includes(username)?'admin':'user'}
function publicState(session,user){const ent=ensureFreeEntitlement(user.id);return {authenticated:true,csrfToken:session.csrf,user:{id:user.id,username:user.username,globalName:user.global_name,avatar:user.avatar,email:user.email||'',occupation:user.occupation||'',gender:user.gender||''},entitlement:{planId:ent.planId,plan:ent.planId,lifetime:ent.lifetime,expiresAt:ent.expiresAt,active:ent.active},role:{name:user.role},access:{allowed:true,reason:null},owner:user.role==='owner',quota:quotaState(user.id),guildInvite:env.viteDiscordShopUrl||env.discordShopUrl||null}}
function setSession(reply,user,request){const s=createSession(user.id,{ip:request.ip,userAgent:request.headers['user-agent']});reply.setCookie(SESSION_COOKIE,s.token,cookieOptions(env.sessionAbsoluteSeconds));reply.setCookie(CSRF_COOKIE,s.csrf,csrfCookieOptions(env.sessionAbsoluteSeconds));return s}

export default async function authRoutes(app){

  app.get('/api/auth/discord/start',{handler:async(request,reply)=>{
    if(!env.discord.clientId||!env.discord.clientSecret||!env.discord.redirectUri)return reply.code(503).send({code:'discord_unconfigured',message:'Discord AUTH is not configured on this server.'})
    const state=randomToken(24),{verifier,challenge}=pkcePair(),now=Date.now();
    db.prepare('INSERT INTO oauth_states (state_hash,code_verifier,return_to,created_at,expires_at) VALUES (?,?,?,?,?)').run(sha256(state),verifier,String(request.query?.returnTo||'/panel').startsWith('/')?String(request.query.returnTo||'/panel'):'/panel',now,now+600000);
    reply.setCookie('openeyes_oauth',state,{...cookieOptions(600),sameSite:'lax'});reply.redirect(authorizeUrl({state,challenge}),303)
  }})
  app.get('/api/auth/discord/callback',{handler:async(request,reply)=>{const {code,state}=request.query||{};const cookieState=request.cookies?.openeyes_oauth;reply.clearCookie('openeyes_oauth',{path:'/'});if(!code||!state||cookieState!==state)return reply.redirect('/login?auth=invalid',303);const row=db.prepare('UPDATE oauth_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING code_verifier,return_to').get(Date.now(),sha256(state),Date.now());if(!row)return reply.redirect('/login?auth=expired',303);let token,identity;try{token=await exchangeCode(code,row.code_verifier);identity=await fetchIdentity(token.access_token)}catch{return reply.redirect('/login?auth=failed',303)}finally{if(token?.access_token)await revokeToken(token.access_token)}const now=Date.now();db.prepare(`INSERT INTO users (id,username,email,password_hash,global_name,avatar,role,created_at,updated_at,last_login_at,last_ip) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,global_name=excluded.global_name,avatar=excluded.avatar,last_login_at=excluded.last_login_at,updated_at=excluded.updated_at`).run(identity.id,identity.username,null,null,identity.globalName,identity.avatar,'user',now,now,now,request.ip);ensureFreeEntitlement(identity.id);const user=db.prepare('SELECT * FROM users WHERE id=?').get(identity.id);setSession(reply,user,request);return reply.redirect(row.return_to||'/panel',303)}})
  app.post('/api/auth/register',{config:{rateLimit:{max:8,timeWindow:'10 minutes'}},handler:async(request,reply)=>{
    if(!checkOrigin(request))return reply.code(403).send({code:'bad_origin',message:'Request rejected.'})
    const {email,username,password}=request.body||{}
    const u=String(username||'').trim(), e=String(email||'').trim().toLowerCase(), p=String(password||'')
    if(!validEmail(e)||!validUsername(u)||p.length<10||p.length>128)return reply.code(400).send({code:'validation',message:'Use a valid email, a 3–32 character username and a password of at least 10 characters.'})
    if(selectByUsername.get(u))return reply.code(409).send({code:'duplicate_username',message:'That username is already in use.'})
    if(selectByEmail.get(e))return reply.code(409).send({code:'duplicate_email',message:'That email is already in use.'})
    const id=randomBytes(12).toString('hex'), now=Date.now(), role=roleFor(u)
    insertUser.run(id,u,e,hashPassword(p),role,u,now,now,now,request.ip); ensureFreeEntitlement(id)
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(id); const session=setSession(reply,user,request); audit('auth.register',{actor:id,ipHash:null}); reply.code(201).send(publicState(session,user))
  }})
  app.post('/api/auth/login',{config:{rateLimit:{max:12,timeWindow:'10 minutes'}},handler:async(request,reply)=>{
    if(!checkOrigin(request))return reply.code(403).send({code:'bad_origin',message:'Request rejected.'})
    const {username,password}=request.body||{}, login=String(username||'').trim(), pass=String(password||'')
    const user=selectByLogin.get(login,login)
    if(!user||!user.password_hash||!verifyPassword(pass,user.password_hash)||user.blocked_at)return reply.code(401).send({code:'invalid_credentials',message:'Username or password is incorrect.'})
    updateLogin.run(Date.now(),request.ip,Date.now(),user.id); ensureFreeEntitlement(user.id); const fresh=db.prepare('SELECT * FROM users WHERE id=?').get(user.id); const session=setSession(reply,fresh,request); audit('auth.login',{actor:user.id}); reply.send(publicState(session,fresh))
  }})
  app.post('/api/auth/logout',{config:{rateLimit:{max:30,timeWindow:'5 minutes'}},handler:async(request,reply)=>{attachSession(request);if(!checkOrigin(request)||!checkCsrf(request))return reply.code(403).send({code:'csrf',message:'Request rejected.'});const s=requireSession(request,reply);if(!s)return;revokeSession(s.id);reply.clearCookie(SESSION_COOKIE,{path:'/'});reply.clearCookie(CSRF_COOKIE,{path:'/'});reply.send({ok:true})}})
}
