import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { useStore } from '../state/store.jsx'
import { ping } from '../lib/api.js'
import { call } from '../lib/session.js'
import { useAuth } from '../state/auth.jsx'

export default function Settings() {
  const { settings, setSettings, dispatch } = useStore()
  const { user, reload } = useAuth()
  const [profile, setProfile] = useState({ email: user?.email || '', globalName: user?.globalName || '', occupation: user?.occupation || '', gender: user?.gender || '', avatar: user?.avatar || '', password: '' })
  const [profileState, setProfileState] = useState(null)
  const [probe, setProbe] = useState(null)
  const [newKey, setNewKey] = useState({ name: '', value: '' })

  const keys = Object.entries(settings.keys || {})

  const saveProfile = async () => {
    setProfileState({ state: 'saving' })
    try { const next = await call('/api/account/profile', { method: 'POST', body: profile }); setProfileState({ state: 'ok' }); await reload(); setProfile((p) => ({ ...p, password: '', ...next.user })) }
    catch (e) { setProfileState({ state: 'bad', error: e.message }) }
  }

  const pickAvatar = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setProfileState({state:'bad',error:'Please choose an image.'}); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image(); img.onload = () => { const max=256; const scale=Math.min(1,max/img.width,max/img.height); const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale)); c.getContext('2d').drawImage(img,0,0,c.width,c.height); setProfile(p=>({...p,avatar:c.toDataURL('image/webp',0.82)})) }; img.src=reader.result
    }; reader.readAsDataURL(file)
  }


  const test = async () => {
    setProbe({ state: 'checking' })
    const res = await ping(settings)
    setProbe(res.ok ? { state: 'ok', ms: res.ms } : { state: 'bad', error: res.error })
  }

  const addKey = () => {
    const name = newKey.name.trim()
    if (!name) return
    setSettings({ keys: { ...(settings.keys || {}), [name]: newKey.value } })
    setNewKey({ name: '', value: '' })
  }

  const removeKey = (name) => {
    const next = { ...(settings.keys || {}) }
    delete next[name]
    setSettings({ keys: next })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Where the backend is, how requests behave, which keys your providers read.</p>
        </div>
      </div>

      <section className="settings-block profile-settings-block" style={{ gridColumn: '1 / -1' }}>
        <span className="label">Profile</span>
        <div className="profile-editor">
          <div className="profile-avatar-editor">
            {profile.avatar ? <img src={profile.avatar} alt="Profile" /> : <span>{(profile.globalName || user?.username || 'O').slice(0,1).toUpperCase()}</span>}
            <label className="btn btn-sm">Change picture<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e)=>pickAvatar(e.target.files?.[0])}/></label>
          </div>
          <div className="profile-fields">
            <div className="field"><label className="field-label">Name</label><input className="input" value={profile.globalName} onChange={e=>setProfile({...profile,globalName:e.target.value})}/></div>
            <div className="field"><label className="field-label">Email</label><input className="input" type="email" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></div>
            <div className="field"><label className="field-label">Occupation</label><input className="input" value={profile.occupation} onChange={e=>setProfile({...profile,occupation:e.target.value})}/></div>
            <div className="field"><label className="field-label">Gender</label><input className="input" value={profile.gender} onChange={e=>setProfile({...profile,gender:e.target.value})}/></div>
            <div className="field"><label className="field-label">New password</label><input className="input" type="password" autoComplete="new-password" placeholder="Leave empty to keep current" value={profile.password} onChange={e=>setProfile({...profile,password:e.target.value})}/></div>
            <div style={{display:'flex',alignItems:'center',gap:10}}><button className="btn btn-primary" onClick={saveProfile} disabled={profileState?.state==='saving'}>{profileState?.state==='saving'?'Saving…':'Save profile'}</button>{profileState?.state==='ok'&&<span className="tag tag-accent">Saved</span>}{profileState?.state==='bad'&&<span className="tag tag-danger">{profileState.error}</span>}</div>
          </div>
        </div>
      </section>

      <div className="settings-grid">
        <section className="settings-block">
          <span className="label">Backend</span>

          <div className="field">
            <label className="field-label" htmlFor="s-base">
              Base URL
            </label>
            <input
              id="s-base"
              className="input"
              value={settings.apiBaseUrl}
              placeholder="http://127.0.0.1:8000, empty uses the dev proxy"
              spellCheck={false}
              onChange={(e) => setSettings({ apiBaseUrl: e.target.value.trim() })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="s-token">
              Bearer token
            </label>
            <input
              id="s-token"
              className="input"
              type="password"
              value={settings.apiToken}
              placeholder="optional"
              autoComplete="off"
              onChange={(e) => setSettings({ apiToken: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="s-timeout">
              Give up after, ms
            </label>
            <input
              id="s-timeout"
              className="input"
              type="number"
              min={1000}
              max={300000}
              value={settings.timeoutMs}
              onChange={(e) => setSettings({ timeoutMs: Number(e.target.value) || 30000 })}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={test}>
              <Icon name="radar" size={12} />
              Test it
            </button>
            {probe?.state === 'checking' && <span className="label">checking</span>}
            {probe?.state === 'ok' && <span className="tag tag-accent">answered in {probe.ms}ms</span>}
            {probe?.state === 'bad' && <span className="tag tag-danger">{probe.error}</span>}
          </div>
          <p className="label" style={{ marginTop: 12 }}>
            looks for GET /api/health
          </p>
        </section>

        <section className="settings-block">
          <span className="label">Behaviour</span>

          <div className="field">
            <label className="field-label" htmlFor="s-operator">
              Operator name
            </label>
            <input
              id="s-operator"
              className="input"
              value={settings.operator}
              onChange={(e) => setSettings({ operator: e.target.value })}
            />
          </div>

          <div className="field">
            <span className="field-label">Theme</span>
            <div className="chip-set">
              {['dark', 'light'].map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`chip${settings.theme === theme ? ' on' : ''}`}
                  onClick={() => setSettings({ theme })}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-block">
          <span className="label">API keys</span>

          <div className="notice notice-neutral" style={{ marginBottom: 16 }}>
            <Icon name="alert" size={14} />
            <span>
              These sit in this browser's local storage, readable by anything running on this origin. Fine for a
              throwaway key, wrong for a valuable one. Keep those on your backend and let it make the call.
            </span>
          </div>

          {keys.length === 0 && (
            <p className="label" style={{ marginBottom: 14 }}>
              none stored
            </p>
          )}

          {keys.map(([name, value]) => (
            <div className="key-row" key={name}>
              <input className="input" value={name} readOnly />
              <input
                className="input"
                type="password"
                value={value}
                onChange={(e) => setSettings({ keys: { ...settings.keys, [name]: e.target.value } })}
              />
              <button className="btn btn-sm" onClick={() => removeKey(name)} aria-label={`Remove ${name}`}>
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}

          <div className="key-row" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="provider, e.g. shodan"
              value={newKey.name}
              onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
            />
            <input
              className="input"
              type="password"
              placeholder="key"
              autoComplete="off"
              value={newKey.value}
              onChange={(e) => setNewKey({ ...newKey, value: e.target.value })}
            />
            <button className="btn btn-sm" onClick={addKey} disabled={!newKey.name.trim()}>
              Add
            </button>
          </div>

          <p className="label" style={{ marginTop: 14 }}>
            reachable as settings.keys.shodan
          </p>
        </section>

        <section className="settings-block">
          <span className="label">Local data</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => dispatch({ type: 'clear:history' })}>
              Clear history
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                localStorage.clear()
                location.reload()
              }}
            >
              Wipe everything
            </button>
          </div>
        </section>
      </div>
    </>
  )
}
