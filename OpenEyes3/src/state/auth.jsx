import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { consumeHandoff, fetchMe, logout as endSession, refreshRole } from '../lib/session.js'

const AuthContext = createContext(null)

const ANONYMOUS = { authenticated: false }

// `npm run dev:panel` only. Lets the panel render without the backend running,
// for UI work on the layout. It fakes nothing but the gate: every lookup still
// goes to the server and fails without one. Resolved at build time, so it
// cannot reach a production bundle.
const SKIP_GATE = import.meta.env.DEV && import.meta.env.VITE_DEV_NO_AUTH === '1'

const LOCAL_ONLY = {
  authenticated: true,
  user: { id: '0', username: 'local', globalName: 'Local' },
  entitlement: { plan: 'local', expiresAt: null, active: true },
  role: { id: null, held: true, inGuild: true },
  access: { allowed: true, reason: null },
  guildInvite: null,
  quota: { used: 0, limit: null, remaining: null, unlimited: true },
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(ANONYMOUS)
  const [status, setStatus] = useState('loading')

  const load = useCallback(async (signal) => {
    if (SKIP_GATE) {
      setState(LOCAL_ONLY)
      setStatus('ready')
      return
    }
    try {
      await consumeHandoff()
      const me = await fetchMe(signal)
      setState(me ?? ANONYMOUS)
      setStatus('ready')
    } catch (err) {
      if (err.code === 'aborted') return
      setState(ANONYMOUS)
      setStatus(err.code === 'network' ? 'offline' : 'ready')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [load])

  const value = useMemo(
    () => ({
      status,
      authenticated: Boolean(state.authenticated),
      user: state.user ?? null,
      entitlement: state.entitlement ?? null,
      role: state.role ?? null,
      access: state.access ?? { allowed: false, reason: 'unauthenticated' },
      guildInvite: state.guildInvite ?? null,
      quota: state.quota ?? null,
      owner: Boolean(state.owner),
      reload: () => load(),
      async recheck() {
        setStatus('loading')
        try {
          const me = await refreshRole()
          setState(me ?? ANONYMOUS)
        } catch {
          await load()
          return
        }
        setStatus('ready')
      },
      async signOut() {
        try {
          await endSession()
        } finally {
          setState(ANONYMOUS)
          setStatus('ready')
        }
      },
    }),
    [state, status, load],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
