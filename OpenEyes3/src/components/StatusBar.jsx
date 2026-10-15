import { useEffect, useState } from 'react'
import { useStore } from '../state/store.jsx'
import { useAuth } from '../state/auth.jsx'
import { clockTime } from '../lib/format.js'
import { MODULES } from '../data/modules.js'

export default function StatusBar() {
  const { settings, target, history } = useStore()
  const { quota } = useAuth()
  const [now, setNow] = useState(() => clockTime())

  useEffect(() => {
    const t = setInterval(() => setNow(clockTime()), 1000)
    return () => clearInterval(t)
  }, [])

  const runs = history.length
  const findings = history.reduce((sum, h) => sum + (h.findings || 0), 0)

  let searches = ['—', '']
  if (quota?.unlimited) searches = ['unlimited', 'status-ok']
  else if (quota && typeof quota.limit === 'number') {
    const left = quota.remaining ?? Math.max(0, quota.limit - quota.used)
    searches = [`${quota.used}/${quota.limit}`, left === 0 ? 'status-bad' : left <= 3 ? 'status-warn' : 'status-ok']
  }

  return (
    <footer className="statusbar">
      <span>
        <b>{settings.operator || 'operator'}</b>@openeyes
      </span>
      <span>
        searches today <span className={searches[1]}>{searches[0]}</span>
      </span>
      <span>
        target <b>{target || 'none'}</b>
      </span>
      <span>
        modules <b>{MODULES.length}</b>
      </span>
      <span>
        runs <b>{runs}</b>
      </span>
      <span>
        findings <b>{findings}</b>
      </span>
      <span style={{ marginLeft: 'auto' }}>{now}</span>
    </footer>
  )
}
