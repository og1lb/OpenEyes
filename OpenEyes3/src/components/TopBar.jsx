import Icon from './Icon.jsx'
import { useStore } from '../state/store.jsx'

export default function TopBar({ onOpenPalette, onToggleSidebar }) {
  const { target, setTarget, settings, setSettings } = useStore()
  const nextTheme = settings.theme === 'dark' ? 'light' : 'dark'

  return (
    <header className="topbar">
      <button
        className="btn btn-ghost btn-sm mobile-only"
        onClick={onToggleSidebar}
        aria-label="Toggle navigation"
      >
        <Icon name="grid" />
      </button>

      <label className="target-box">
        <Icon name="target" size={15} style={{ color: target ? 'var(--accent)' : 'var(--text-dim)' }} />
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="set investigation target"
          spellCheck={false}
          aria-label="Investigation target"
        />
        {target && (
          <button className="btn btn-ghost btn-sm" onClick={() => setTarget('')} aria-label="Clear target">
            <Icon name="trash" size={13} />
          </button>
        )}
      </label>

      <button className="btn btn-sm" onClick={onOpenPalette}>
        <Icon name="search" size={14} />
        Jump to
        <span className="kbd">Ctrl K</span>
      </button>

      <div className="topbar-spacer" />

      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setSettings({ theme: nextTheme })}
        aria-label={`Switch to ${nextTheme} theme`}
        title={`Switch to ${nextTheme} theme`}
      >
        <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} />
      </button>
    </header>
  )
}
