import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../Logo.jsx'
import Icon from '../Icon.jsx'
import AccountChip from './AccountChip.jsx'

export default function SiteHead() {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-head${stuck ? ' stuck' : ''}`}>
      <Link to="/" className="brand" aria-label="OpenEyes">
        <Logo size={24} />
        <span className="brand-word">
          Intel<span>Scope</span>
        </span>
      </Link>

      <div className="head-right">
        <Link className="head-link" to="/panel">
          Panel
        </Link>
        <a className="head-link" href="#register">
          Modules
        </a>
        <a className="head-link" href="#terms">
          Pricing
        </a>
        <AccountChip />
        <a className="nav-toggle" href="#entry" aria-label="Join the waitlist">
          <Icon name="mail" size={15} />
        </a>
      </div>
    </header>
  )
}
