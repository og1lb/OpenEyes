import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../state/auth.jsx'

const REASONS = {
  no_entitlement: 'This account has no active plan, so it carries no plan role.',
  not_in_guild: 'This account is not in the Discord server, so the role cannot be handed out.',
  no_role: 'The plan is active but the role is not on this account yet. Recheck, and if it stays off, the bot may sit below the role in the server list.',
  discord_unreachable: 'Discord did not answer, so the role could not be checked.',
}

export default function AccessGate({ children }) {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="gate-screen">
        <p className="gate-line">Checking access</p>
      </div>
    )
  }

  if (auth.status === 'offline') {
    return (
      <div className="gate-screen">
        <h1>The server is not answering</h1>
        <p className="gate-line">The panel needs the backend to check the role, so it stays shut until it answers.</p>
        <button className="stamp-btn" onClick={auth.reload} type="button">
          Try again
        </button>
      </div>
    )
  }

  if (!auth.authenticated) {
    return <Navigate to="/?auth=required#terms" replace />
  }

  if (!auth.access.allowed) {
    return (
      <div className="gate-screen">
        <h1>No access on this account</h1>
        <p className="gate-line">{REASONS[auth.access.reason] ?? 'Access was refused.'}</p>
        <div className="gate-actions">
          {auth.guildInvite && auth.access.reason === 'not_in_guild' && (
            <a className="stamp-btn" href={auth.guildInvite} rel="noreferrer noopener" target="_blank">
              Join the server
            </a>
          )}
          <Link className="stamp-btn" to="/#terms">
            See the plans
          </Link>
          <button className="text-link" onClick={auth.recheck} type="button">
            Recheck
          </button>
        </div>
      </div>
    )
  }

  return children
}
