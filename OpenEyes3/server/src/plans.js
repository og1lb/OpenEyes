import { db } from './db.js'

export const PLAN_ID_PATTERN = '^[a-z0-9][a-z0-9-]{1,31}$'
const PLAN_ID = new RegExp(PLAN_ID_PATTERN)
const ROLE_ID = /^\d{5,25}$/

const defaults = [
  ['free','Free',0,30,0,5,0],
  ['starter','Starter',499,30,0,15,1],
  ['premium','Premium',999,30,0,35,2],
  ['lifetime','Lifetime',3999,null,1,70,3],
  ['media','Media',0,30,0,15,4],
]
const insert = db.prepare('INSERT OR IGNORE INTO plans (id,name,usd_cents,duration_days,lifetime,daily_limit,role_id,active,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
const now=Date.now()
for(const [id,name,cents,days,lifetime,limit,sort] of defaults) insert.run(id,name,cents,days,lifetime,limit,null,1,sort,now,now)
const allStmt=db.prepare('SELECT * FROM plans ORDER BY sort ASC, usd_cents ASC')
const activeStmt=db.prepare('SELECT * FROM plans WHERE active=1 ORDER BY sort ASC, usd_cents ASC')
const oneStmt=db.prepare('SELECT * FROM plans WHERE id=?')
function shape(r){return r?{id:r.id,name:r.name,usdCents:r.usd_cents,durationDays:r.duration_days,lifetime:r.lifetime===1,dailyLimit:r.daily_limit,roleId:r.role_id,active:r.active===1,sort:r.sort,updatedAt:r.updated_at}:null}
export function getPlan(id){return typeof id==='string'&&PLAN_ID.test(id)?shape(oneStmt.get(id)):null}
export function allPlans(){return allStmt.all().map(shape)}
export function publicPlans(){return activeStmt.all().map(r=>{const p=shape(r); return {id:p.id,name:p.name,usdCents:p.usdCents,durationDays:p.durationDays,lifetime:p.lifetime,dailyLimit:p.dailyLimit}})}
export function managedRoleIds(){return []}
export class PlanError extends Error { constructor(message){super(message);this.statusCode=400;this.code='bad_plan'} }
export function createPlan(input){
  if(!input||typeof input.id!=='string'||!PLAN_ID.test(input.id))throw new PlanError('Invalid plan id')
  if(getPlan(input.id))throw Object.assign(new PlanError('A plan with that id exists'),{statusCode:409})
  const cents=Number(input.usdCents); const limit=input.dailyLimit==null?null:Number(input.dailyLimit); const life=Boolean(input.lifetime); const days=life?null:Number(input.durationDays||30); const n=Date.now()
  db.prepare('INSERT INTO plans (id,name,usd_cents,duration_days,lifetime,daily_limit,role_id,active,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(input.id,input.name,cents,days,life?1:0,limit,null,input.active===false?0:1,Number(input.sort)||0,n,n)
  return getPlan(input.id)
}
export function updatePlan(id,input){const p=getPlan(id);if(!p)return null;db.prepare('UPDATE plans SET name=?,usd_cents=?,duration_days=?,lifetime=?,daily_limit=?,active=?,sort=?,updated_at=? WHERE id=?').run(input.name,Number(input.usdCents),input.lifetime?null:Number(input.durationDays||30),input.lifetime?1:0,input.dailyLimit==null?null:Number(input.dailyLimit),input.active===false?0:1,Number(input.sort)||0,Date.now(),id);return getPlan(id)}
