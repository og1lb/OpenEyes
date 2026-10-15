import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'

export default function NotFound() {
  return (
    <div className="empty-state">
      <span className="ring">
        <Icon name="alert" size={18} />
      </span>
      <p>That route does not exist.</p>
      <Link className="btn btn-sm" to="/panel">
        Back to dashboard
      </Link>
    </div>
  )
}
