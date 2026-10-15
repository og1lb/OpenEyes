import { useRef, useState } from 'react'
import Icon from './Icon.jsx'

function Toggle({ field, value, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
      <span className="switch-label">{field.label}</span>
    </label>
  )
}

function MultiSelect({ field, value, onChange }) {
  const selected = Array.isArray(value) ? value : []
  const toggle = (option) =>
    onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option])

  return (
    <div className="chip-set">
      {field.options.map((option) => (
        <button
          key={option}
          type="button"
          className={`chip${selected.includes(option) ? ' on' : ''}`}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function FileField({ field, value, onChange }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)

  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onChange(file)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={field.accept}
        hidden
        onChange={(e) => onChange(e.target.files?.[0] || '')}
      />
      <Icon name="file" size={20} />
      {value ? <strong>{value.name}</strong> : <span>drop a file here or click to browse</span>}
      {value && <span>{(value.size / 1024).toFixed(0)} KB</span>}
    </div>
  )
}

export default function QueryForm({ mod, values, onChange, onRun, onCancel, running }) {
  const set = (name, v) => onChange({ ...values, [name]: v })

  const missing = mod.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = values[f.name]
      return v === '' || v === undefined || v === null || (Array.isArray(v) && v.length === 0)
    })

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault()
        if (!running && missing.length === 0) onRun()
      }}
    >
      <div className="panel-head">
        <Icon name={mod.icon} size={14} style={{ color: 'var(--accent)' }} />
        <span className="label">Query</span>
        <span className="tag" style={{ marginLeft: 'auto' }}>
          {mod.target}
        </span>
      </div>

      <div className="panel-body">
        {mod.fields.map((field) => {
          const value = values[field.name]

          if (field.type === 'toggle') {
            return (
              <div className="field" key={field.name}>
                <Toggle field={field} value={value} onChange={(v) => set(field.name, v)} />
              </div>
            )
          }

          return (
            <div className="field" key={field.name}>
              <label htmlFor={`f-${field.name}`} className="field-label">
                {field.label}
                {field.required && <span className="req">*</span>}
              </label>

              {field.type === 'select' && field.multiple && (
                <MultiSelect field={field} value={value} onChange={(v) => set(field.name, v)} />
              )}

              {field.type === 'select' && !field.multiple && (
                <select
                  id={`f-${field.name}`}
                  className="input"
                  value={value}
                  onChange={(e) => set(field.name, e.target.value)}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}

              {field.type === 'number' && (
                <input
                  id={`f-${field.name}`}
                  className="input"
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={value}
                  onChange={(e) => set(field.name, e.target.value === '' ? '' : Number(e.target.value))}
                />
              )}

              {field.type === 'file' && (
                <FileField field={field} value={value} onChange={(v) => set(field.name, v)} />
              )}

              {field.type === 'text' && (
                <input
                  id={`f-${field.name}`}
                  className="input"
                  value={value}
                  placeholder={field.placeholder}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => set(field.name, e.target.value)}
                />
              )}
            </div>
          )
        })}

        {mod.authorised && (
          <div className="notice notice-warn" style={{ marginBottom: 14 }}>
            <Icon name="alert" size={14} />
            <span>Active probing. Run this only against hosts you own or have written permission to test.</span>
          </div>
        )}

        <div className="form-actions">
          {running ? (
            <button type="button" className="btn btn-primary" onClick={onCancel}>
              <Icon name="stop" size={13} />
              Cancel
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={missing.length > 0}>
              <Icon name="play" size={13} />
              Run module
            </button>
          )}
        </div>

        {missing.length > 0 && !running && (
          <p className="label" style={{ marginTop: 10 }}>
            required: {missing.map((f) => f.label).join(', ')}
          </p>
        )}
      </div>
    </form>
  )
}
