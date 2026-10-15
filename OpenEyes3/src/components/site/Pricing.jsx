import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CryptoCheckout from './CryptoCheckout.jsx'
import { fetchPlans, loginUrl } from '../../lib/session.js'
import { useAuth } from '../../state/auth.jsx'

const FALLBACK = {
  plans: [
    { id: 'monthly', name: 'Monthly', usdCents: 900, durationDays: 30, lifetime: false, dailyLimit: 20 },
    { id: 'lifetime', name: 'Lifetime', usdCents: 12000, durationDays: null, lifetime: true, dailyLimit: 70 },
  ],
  assets: ['btc', 'ltc'],
}

const COPY = {
  monthly: {
    blurb: 'Thirty days. Pay again for thirty more.',
    badge: 'you renew it',
    note: 'We hold nothing that could bill you twice. Day thirty-one, the role comes off.',
    lines: [
      'Runs go through the server, keys stay there',
      'JSON and CSV out of every result',
      'Access follows the role and nothing else',
    ],
  },
  lifetime: {
    blurb: 'Pay once. The role stays on.',
    badge: 'paid once',
    note: 'One confirmation on chain and the invoice is closed for good.',
    lines: [
      'No expiry on the role',
      'Saved cases and scheduled re-runs when they land',
      'This price, before a public one exists',
    ],
  },
}

function copyFor(plan) {
  const known = COPY[plan.id]
  const base = known ?? {
    blurb: plan.lifetime ? 'Pay once. The role stays on.' : `${plan.durationDays} days of access.`,
    badge: plan.lifetime ? 'paid once' : `${plan.durationDays} days`,
    note: plan.lifetime ? 'One confirmation on chain and it is yours.' : 'It runs out on its own. Nothing renews behind your back.',
    lines: ['Runs go through the server, keys stay there', 'JSON and CSV out of every result'],
  }
  const limit = plan.dailyLimit ? `${plan.dailyLimit} searches a day, across every module` : 'Unlimited searches'
  return { ...base, lines: [limit, ...base.lines] }
}

function monthsInLifetime(plans) {
  const monthly = plans.find((p) => !p.lifetime)
  const lifetime = plans.find((p) => p.lifetime)
  if (!monthly?.usdCents || !lifetime?.usdCents) return null
  return Math.round(lifetime.usdCents / monthly.usdCents)
}

function price(cents) {
  const value = cents / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function GateNotice() {
  const auth = useAuth()
  const [gate, setGate] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reason = params.get('gate') || params.get('auth')
    if (reason) setGate(reason)
  }, [])

  if (auth.status === 'loading') return null

  if (!auth.authenticated) {
    if (!gate) return null
    const text =
      gate === 'declined'
        ? 'The Discord sign in was cancelled, so nothing changed.'
        : gate === 'blocked'
          ? 'This Discord account is blocked from the panel.'
          : gate === 'expired'
            ? 'That sign in link had already been used. Start again.'
            : 'Sign in with Discord to reach the panel.'
    return <p className="gate-note">{text}</p>
  }

  if (auth.access.allowed) {
    return (
      <p className="gate-note ok">
        The role is on this account.{' '}
        <Link className="text-link" to="/panel">
          Open the panel
        </Link>
      </p>
    )
  }

  if (auth.access.reason === 'not_in_guild') {
    return (
      <p className="gate-note">
        Payment is recorded, but this account is not in the Discord server, so the role cannot be handed out.{' '}
        {auth.guildInvite ? (
          <a className="text-link" href={auth.guildInvite} rel="noreferrer noopener" target="_blank">
            Join, then recheck
          </a>
        ) : (
          'Join the server, then recheck.'
        )}{' '}
        <button className="text-link" onClick={auth.recheck} type="button">
          Recheck
        </button>
      </p>
    )
  }

  if (auth.access.reason === 'no_role') {
    return (
      <p className="gate-note">
        Signed in, no access role yet.{' '}
        <button className="text-link" onClick={auth.recheck} type="button">
          Recheck
        </button>
      </p>
    )
  }

  return <p className="gate-note">Signed in as {auth.user?.username}. Pick a plan below.</p>
}

export default function Pricing() {
  const auth = useAuth()
  const [catalog, setCatalog] = useState(FALLBACK)

  useEffect(() => {
    const controller = new AbortController()
    fetchPlans(controller.signal)
      .then((res) => {
        if (Array.isArray(res?.plans) && res.plans.length > 0) setCatalog(res)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const months = monthsInLifetime(catalog.plans)

  return (
    <>
      <GateNotice />

      <div className="tier-grid">
        {catalog.plans.map((plan) => {
          const copy = copyFor(plan)
          const owned = auth.entitlement?.active && (plan.lifetime ? auth.entitlement.lifetime : true)

          return (
            <div className={`tier${plan.lifetime ? ' tier-featured' : ''}`} key={plan.id}>
              <div className="tier-head">
                <span className="eyebrow">{plan.name}</span>
                <span className="tier-badge">{copy.badge}</span>
              </div>

              <div className="tier-price">
                ${price(plan.usdCents)}
                <span className="suffix">{plan.lifetime ? 'once' : 'per month'}</span>
              </div>

              {plan.lifetime && months ? (
                <p className="tier-compare">costs what {months} months would</p>
              ) : null}

              <p className="tier-note">{copy.note}</p>

              <ul className="tier-list">
                {copy.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              {owned && plan.lifetime ? (
                <Link className="stamp-btn" to="/panel">
                  Open the panel
                </Link>
              ) : (
                <CryptoCheckout
                  assets={catalog.assets}
                  plan={{ id: plan.id, name: plan.name, usdCents: plan.usdCents, blurb: copy.blurb }}
                />
              )}
            </div>
          )
        })}
      </div>

      {!auth.authenticated && auth.status === 'ready' && (
        <p className="tier-foot">
          Paying needs a Discord account. The role is what the panel checks, so there has to be somewhere to put it.{' '}
          <a className="text-link" href={loginUrl('/#terms')}>
            Sign in with Discord
          </a>
        </p>
      )}
    </>
  )
}
