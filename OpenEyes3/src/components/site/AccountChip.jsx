import { loginUrl } from '../../lib/session.js'
import { useAuth } from '../../state/auth.jsx'

export default function AccountChip() {
  const auth = useAuth()

  if (auth.status === 'loading') return <span className="head-link" aria-hidden="true" />

  if (!auth.authenticated) {
    return (
      <a className="head-link" href={loginUrl('/panel')}>
        Sign in
      </a>
    )
  }

  const name = auth.user?.globalName || auth.user?.username || 'account'

  return (
    <div className="account-chip">
      <span className={`pip${auth.access.allowed ? ' on' : ''}`} />
      <span className="account-name">{name}</span>
      {auth.owner && (
        <a className="head-link" href="/admin">
          Admin
        </a>
      )}
      <button className="head-link" onClick={auth.signOut} type="button">
        Sign out
      </button>
    </div>
  )
}
