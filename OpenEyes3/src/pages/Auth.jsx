import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { call, loginUrl } from '../lib/session.js'
import { useAuth } from '../state/auth.jsx'

function AuthShell({mode}){
  const isLogin=mode==='login'; const nav=useNavigate(); const {reload}=useAuth(); const [params]=useSearchParams()
  const [form,setForm]=useState({email:'',username:'',password:''}); const [busy,setBusy]=useState(false); const [error,setError]=useState('')
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await call(`/api/auth/${isLogin?'login':'register'}`,{method:'POST',body:isLogin?{username:form.username,password:form.password}:form,anonymous:true});await reload();nav('/panel')}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <div className="auth-page"><div className="auth-card"><Link className="auth-brand" to="/"><img src="/logo.png" alt="OpenEyes"/></Link><div className="auth-copy"><span className="eyebrow">OpenEyes</span><h1>{isLogin?'Welcome back.':'Create your workspace.'}</h1><p>OpenEyes — Nothing stays hidden.</p></div><form onSubmit={submit} className="auth-form">{!isLogin&&<label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} autoComplete="email"/></label>}<label>Username<input required value={form.username} onChange={e=>setForm({...form,username:e.target.value})} autoComplete="username"/></label><label>Password<input type="password" required minLength={isLogin?1:10} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} autoComplete={isLogin?'current-password':'new-password'}/></label>{error&&<div className="auth-error">{error}</div>}<button className="primary-btn" disabled={busy}>{busy?'Authenticating…':isLogin?'Login':'Create account'}</button></form><div className="auth-or"><span>OR</span></div><a className="secondary-btn" href={loginUrl(params.get('returnTo')||'/panel')}>Discord AUTH</a><p className="auth-switch">{isLogin?'No account?':'Already registered?'} <Link to={isLogin?'/register':'/login'}>{isLogin?'Register':'Login'}</Link></p></div></div>
}
export function Login(){return <AuthShell mode="login"/>}
export function Register(){return <AuthShell mode="register"/>}
