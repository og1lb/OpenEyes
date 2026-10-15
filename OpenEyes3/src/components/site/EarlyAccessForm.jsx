import Icon from '../Icon.jsx'

export default function EarlyAccessForm({ email, setEmail, status, submit }) {
  const sending = status.state === 'sending'

  if (status.state === 'done') {
    return (
      <div className="entry-card">
        <div className="done">
          <span className="seal">
            <Icon name="check" size={17} />
          </span>
          <h3>{status.delivered ? 'Filed.' : 'Held on this device.'}</h3>
          <p>
            {status.delivered
              ? 'One mail when the panel opens. Nothing before it, nothing after.'
              : 'The waitlist endpoint is not live yet, so nothing left this browser. Your address is sitting in local storage under the reference below.'}
          </p>
          <span className="ref">{status.reference}</span>
        </div>
      </div>
    )
  }

  return (
    <form
      className="entry-card"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <span className="eyebrow">Your email, nothing else</span>

      <div className="field-line">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
          autoComplete="email"
          aria-label="Email address"
          required
        />
      </div>

      <button className="stamp-btn" type="submit" disabled={sending}>
        {sending ? 'Filing' : 'File my name'}
        {!sending && <Icon name="chevron" size={12} />}
      </button>

      {(status.state === 'invalid' || status.state === 'failed') && (
        <p className="form-caption err">{status.message}</p>
      )}
      {status.state === 'idle' && <p className="form-caption">no card · no account · leave whenever</p>}
    </form>
  )
}
