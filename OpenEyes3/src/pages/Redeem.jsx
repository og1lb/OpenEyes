import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { call } from '../lib/session.js'
import { useAuth } from '../state/auth.jsx'

export default function Redeem(){
  const { reload, entitlement } = useAuth()
  const [key,setKey]=useState('')
  const [state,setState]=useState(null)
  const submit=async(e)=>{e.preventDefault();if(!key.trim())return;setState({type:'loading'});try{const d=await call('/api/account/redeem-key',{method:'POST',body:{key}});setState({type:'ok',message:`${d.plan?.name||d.plan?.id||'Plan'} activated.`});setKey('');await reload()}catch(err){setState({type:'bad',message:err.message})}}
  return <><div className="page-head"><div><span className="eyebrow">OPEN EYES / ACCESS</span><h1 className="page-title">Redeem key</h1><p className="page-sub">Redeem a one-time OpenEyes access key. The plan is applied to your account immediately.</p></div></div><section className="panel-card redeem-card"><div className="redeem-icon"><Icon name="key" size={20}/></div><div><h2>Activate access</h2><p className="page-sub">Your current plan: <b>{entitlement?.planId||'Free'}</b></p></div><form onSubmit={submit} className="redeem-form"><label className="field-label" htmlFor="redeem-key">OpenEyes key</label><div className="redeem-input-row"><input id="redeem-key" className="input" value={key} onChange={e=>setKey(e.target.value.toUpperCase())} placeholder="OE-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}/><button className="btn btn-primary" disabled={state?.type==='loading'}><Icon name="key" size={13}/>{state?.type==='loading'?'Redeeming…':'Redeem key'}</button></div></form>{state?.type==='ok'&&<div className="notice notice-neutral"><Icon name="check" size={14}/><span>{state.message}</span></div>}{state?.type==='bad'&&<div className="notice notice-danger"><Icon name="alert" size={14}/><span>{state.message}</span></div>}<p className="label" style={{marginTop:18}}>Keys are one-time use. Disabled, deleted or already redeemed keys cannot be reused.</p></section></>
}
