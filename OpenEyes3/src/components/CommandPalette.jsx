import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import { MODULES } from '../data/modules.js'

const EXTRA = [
  { id: 'nav-dashboard', name: 'Dashboard', icon: 'grid', to: '/panel', hint: 'page' },
  { id: 'nav-history', name: 'History', icon: 'clock', to: '/panel/history', hint: 'page' },
  { id: 'nav-settings', name: 'Settings', icon: 'settings', to: '/panel/settings', hint: 'page' },
  { id: 'nav-site', name: 'Public site', icon: 'external', to: '/', hint: 'page' },
]

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const entries = useMemo(() => {
    const all = [
      ...MODULES.map((m) => ({
        id: m.id,
        name: m.name,
        icon: m.icon,
        to: `/panel/module/${m.id}`,
        hint: m.target,
        search: `${m.name} ${m.tagline} ${m.group} ${m.target}`.toLowerCase(),
      })),
      ...EXTRA.map((e) => ({ ...e, search: e.name.toLowerCase() })),
    ]
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((e) => e.search.includes(q))
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setIndex(0), [query])

  if (!open) return null

  const go = (entry) => {
    if (!entry) return
    navigate(entry.to)
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => (entries.length ? (i + 1) % entries.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(entries[index])
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="palette fade-up"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to module"
      >
        <div className="palette-input">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search modules and pages"
            spellCheck={false}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list">
          {entries.length === 0 && <div className="palette-empty">nothing matches “{query}”</div>}
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className={`palette-row${i === index ? ' sel' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(entry)}
            >
              <Icon name={entry.icon} />
              <span className="name">{entry.name}</span>
              <span className="hint">{entry.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
