import { db } from './db.js'
import { isOwnerId, isAdminId, readEntitlement } from './entitlements.js'
import { getPlan } from './plans.js'
const reserveSlot = db.prepare(`INSERT INTO usage_daily (user_id, day, count) VALUES (?1, ?2, 1) ON CONFLICT(user_id, day) DO UPDATE SET count=count+1 WHERE count < ?3 RETURNING count`)
const releaseSlot = db.prepare('UPDATE usage_daily SET count=count-1 WHERE user_id=? AND day=? AND count>0')
const readUsed = db.prepare('SELECT count FROM usage_daily WHERE user_id=? AND day=?')
const pruneOld = db.prepare('DELETE FROM usage_daily WHERE day<?')
export function today(now=Date.now()){ return new Date(now).toISOString().slice(0,10) }
export function limitFor(userId){
  if (isOwnerId(userId)) return null
  if (isAdminId(userId)) return 200
  const ent=readEntitlement(userId); const plan=getPlan(ent?.planId || 'free')
  return plan?.dailyLimit ?? 5
}
export function quotaState(userId){ const limit=limitFor(userId); const used=readUsed.get(userId,today())?.count??0; if(limit===null)return {used,limit:null,remaining:null,unlimited:true}; return {used,limit,remaining:Math.max(0,limit-used),unlimited:false} }
export function reserve(userId){ const limit=limitFor(userId); const row=reserveSlot.get(userId,today(),limit===null?Number.MAX_SAFE_INTEGER:limit); if(!row)return {ok:false,state:quotaState(userId)}; return {ok:true,day:today()} }
export function release(userId,day){releaseSlot.run(userId,day)}
export function pruneUsage(){pruneOld.run(today(Date.now()-90*86400000))}
