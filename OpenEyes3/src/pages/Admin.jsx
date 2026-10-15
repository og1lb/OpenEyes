import { useEffect, useMemo, useState } from 'react'
import { call } from '../lib/session.js'
import Icon from '../components/Icon.jsx'

const ROLE_OPTIONS = [
  { id: 'user', label: 'User' },
  { id: 'media', label: 'Media' },
  { id: 'admin', label: 'Admin' },
  { id: 'owner', label: 'Owner' },
]

const PLAN_ORDER = ['free', 'starter', 'premium', 'lifetime', 'media']

function ChoiceGroup({ label, value, options, disabled, onChange }) {
  return (
    <div className="choice-group">
      <span className="choice-label">{label}</span>
      <div className="choice-pills">
        {options.map((option) => {
          const id = typeof option === 'string' ? option : option.id
          const text = typeof option === 'string' ? option : option.label
          return (
            <button
              type="button"
              key={id}
              disabled={disabled}
              className={`choice-pill${value === id ? ' selected' : ''}`}
              onClick={() => onChange(id)}
            >
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Admin() {
  const [session, setSession] = useState(null)
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [plans, setPlans] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    try {
      setError('')
      const [s, u, p] = await Promise.all([
        call('/api/admin/session'),
        call('/api/admin/users'),
        call('/api/admin/plans'),
      ])
      setSession(s)
      setUsers(u.users || [])
      setPlans(p.plans || [])
      if (s.owner) {
        const x = await call('/api/admin/sessions')
        setSessions(x.sessions || [])
      } else {
        setSessions([])
      }
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { load() }, [])

  async function changeRole(userId, role) {
    setBusy(`role:${userId}`)
    try {
      await call('/api/admin/user/role', { method: 'POST', body: { userId, role } })
      await load()
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  async function changePlan(userId, planId) {
    setBusy(`plan:${userId}`)
    try {
      await call('/api/admin/user/plan', { method: 'POST', body: { userId, planId } })
      await load()
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  if (error && !session) return <div className="empty-state"><Icon name="alert" size={18}/><p>{error}</p></div>

  const planOptions = useMemo(
    () => PLAN_ORDER.map((id) => plans.find((p) => p.id === id)).filter(Boolean).map((p) => ({ id: p.id, label: p.name })),
    [plans],
  )

  return (
    <>
      <div className="page-head">
        <span className="module-icon"><Icon name="settings" size={18}/></span>
        <div>
          <span className="eyebrow">OPEN EYES / CONTROL / ADMIN</span>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-sub">Accounts, roles, plans and active login sessions. Private email/IP data is Owner-only.</p>
        </div>
      </div>

      {error && <div className="notice notice-danger"><Icon name="alert" size={14}/><span>{error}</span></div>}

      <div className="dash-kpis">
        <div><small>ROLE</small><b>{session?.owner ? 'Owner' : 'Admin'}</b></div>
        <div><small>USERS</small><b>{users.length}</b></div>
        <div><small>ACTIVE SESSIONS</small><b>{session?.owner ? sessions.length : '—'}</b></div>
        <div><small>PRIVATE DATA</small><b>{session?.owner ? 'VISIBLE' : 'HIDDEN'}</b></div>
      </div>

      <section className="panel-card">
        <div className="panel-card-head">
          <span>ACCOUNTS</span>
          <em>{session?.owner ? 'Owner controls enabled' : 'Read-only admin view'}</em>
        </div>
        <div className="admin-users-table admin-users-enhanced">
          <div className="admin-row admin-head admin-grid-wide">
            <span>USER</span><span>ROLE</span><span>PLAN</span><span>EMAIL</span><span>LAST LOGIN / IP</span>
          </div>
          {users.map((u) => (
            <div className="admin-row admin-grid-wide admin-user-record" key={u.id}>
              <div className="admin-user-cell">
                <div className="admin-avatar">{u.avatar ? <img src={u.avatar} alt="" /> : <span>{(u.globalName || u.username || 'U').slice(0,1).toUpperCase()}</span>}</div>
                <div><b>{u.username}</b>
                <small>{u.activeSessions || 0} active session(s)</small></div>
              </div>
              <ChoiceGroup
                label=""
                value={u.role}
                options={ROLE_OPTIONS}
                disabled={!session?.owner || busy === `role:${u.id}`}
                onChange={(role) => changeRole(u.id, role)}
              />
              <ChoiceGroup
                label=""
                value={u.planId || 'free'}
                options={planOptions}
                disabled={!session?.owner || busy === `plan:${u.id}`}
                onChange={(planId) => changePlan(u.id, planId)}
              />
              <span className="private-cell">{session?.owner ? (u.email || '—') : 'Private'}</span>
              <div className="login-detail">
                <span>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</span>
                <small>{session?.owner ? (u.lastKnownIp || 'No IP recorded') : 'IP hidden'}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      {session?.owner && (
        <section className="panel-card">
          <div className="panel-card-head">
            <span>ACTIVE LOGIN SESSIONS</span>
            <em>Owner only · current IP/email/session details</em>
          </div>
          <div className="admin-users-table">
            <div className="admin-row admin-head admin-session-grid"><span>USER</span><span>EMAIL</span><span>IP</span><span>LAST SEEN</span><span></span></div>
            {sessions.map((x) => (
              <div className="admin-row admin-session-grid" key={x.id}>
                <span><b>{x.username}</b><small>{x.id.slice(0, 10)}…</small></span>
                <span className="private-cell">{x.email || '—'}</span>
                <span className="private-cell">{x.ip_address || '—'}</span>
                <span>{new Date(x.last_seen_at).toLocaleString()}</span>
                <button className="btn btn-ghost btn-sm" onClick={async () => { await call(`/api/admin/sessions/${x.id}/revoke`, { method: 'POST' }); load() }}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export function KeyGenerator() {
  const [plans, setPlans] = useState([])
  const [keys, setKeys] = useState([])
  const [planId, setPlanId] = useState('starter')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => Promise.all([call('/api/admin/plans'), call('/api/admin/keys')])
    .then(([p, k]) => { setPlans(p.plans || []); setKeys(k.keys || []) })
    .catch((e) => setError(e.message))

  useEffect(() => { load() }, [])

  async function gen() {
    setBusy(true)
    try {
      const d = await call('/api/admin/keys', { method: 'POST', body: { planId, note } })
      setKeys((current) => [d, ...current])
      setNote('')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function act(id, action) {
    try { await call(`/api/admin/keys/${id}/${action}`, { method: 'POST' }); await load() }
    catch (e) { setError(e.message) }
  }

  async function del(id) {
    if (!confirm('Delete this key? This removes it from active key management.')) return
    try { await call(`/api/admin/keys/${id}`, { method: 'DELETE' }); await load() }
    catch (e) { setError(e.message) }
  }

  async function edit(k) {
    const next = prompt('Key note', k.note || '')
    if (next === null) return
    try { await call(`/api/admin/keys/${k.id}`, { method: 'PATCH', body: { note: next } }); await load() }
    catch (e) { setError(e.message) }
  }

  const keyPlans = plans.filter((p) => ['starter', 'premium', 'lifetime'].includes(p.id))

  return (
    <>
      <div className="page-head">
        <span className="module-icon"><Icon name="key" size={18}/></span>
        <div>
          <span className="eyebrow">OPEN EYES / CONTROL / KEYS</span>
          <h1 className="page-title">Key Generator</h1>
          <p className="page-sub">Generate and manage access keys without leaving the OpenEyes sidebar.</p>
        </div>
      </div>
      {error && <div className="notice notice-danger"><Icon name="alert" size={14}/><span>{error}</span></div>}

      <section className="panel-card">
        <div className="panel-card-head"><span>CREATE ACCESS KEY</span><em>Owner only</em></div>
        <div className="plan-choice-grid">
          {keyPlans.map((p) => (
            <button key={p.id} type="button" className={`plan-choice${planId === p.id ? ' selected' : ''}`} onClick={() => setPlanId(p.id)}>
              <span>{p.name}</span>
              <b>{p.dailyLimit ?? '∞'}<small>/day</small></b>
              <em>{p.usdCents ? `€${(p.usdCents / 100).toFixed(2)}` : 'Access key'}</em>
            </button>
          ))}
        </div>
        <div className="key-generator-form">
          <input className="input" placeholder="Note for this key — e.g. Discord order #1042" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary" disabled={busy} onClick={gen}><Icon name="key" size={13}/> {busy ? 'Generating…' : 'Generate key'}</button>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-card-head"><span>KEY MANAGEMENT</span><em>{keys.length} records · Owner only</em></div>
        <div className="key-management">
          {keys.length === 0 && <div className="empty-state"><Icon name="key" size={17}/><p>No keys generated yet.</p></div>}
          {keys.map((k) => (
            <div className={`key-record${k.disabled ? ' disabled' : ''}`} key={k.id}>
              <div>
                <b>{k.key}</b>
                <span>{k.planId}</span>
                <small>Note: {k.note || '—'}</small>
              </div>
              <div>
                <small>Created {new Date(k.createdAt).toLocaleString()}</small>
                <small>{k.redeemedAt ? `Redeemed ${new Date(k.redeemedAt).toLocaleString()}` : 'Not redeemed'}</small>
                {k.redeemedUser && <small>User: {k.redeemedUser}</small>}
                {k.disabled && <span className="tag tag-warn">DISABLED</span>}
              </div>
              <div className="key-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => edit(k)}>Edit note</button>
                <button className="btn btn-ghost btn-sm" onClick={() => act(k.id, k.disabled ? 'enable' : 'disable')}>{k.disabled ? 'Enable' : 'Disable'}</button>
                <button className="btn btn-ghost btn-sm danger-btn" onClick={() => del(k.id)}><Icon name="trash" size={12}/> Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

export default Admin
