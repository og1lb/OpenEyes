import { useState } from 'react'
import Icon from './Icon.jsx'
import { humanKey, duration, toCsv, download, slug } from '../lib/format.js'

import { Link, useNavigate } from 'react-router-dom'

function KvBlock({ data }) {
  const entries = Object.entries(data || {})
  if (entries.length === 0) return <p className="label">no data</p>
  return (
    <dl className="kv">
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'contents' }}>
          <dt>{humanKey(key)}</dt>
          <dd>{value === '' || value === null || value === undefined ? '-' : String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function TableBlock({ rows, columns }) {
  if (!Array.isArray(rows) || rows.length === 0) return <p className="label">no rows</p>
  const cols = columns?.length ? columns : Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {cols.map((col) => (
              <th key={col}>{humanKey(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map((col) => {
                const value = row[col]
                const text = value === null || value === undefined || value === '' ? '-' : String(value)
                const isLink = /^https?:\/\//.test(text)
                return (
                  <td key={col} className={`${text === '-' ? 'empty' : ''} ${/password|secret|token/i.test(col) ? 'sensitive-cell' : ''}`.trim()}>
                    {isLink ? (
                      <a href={text} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--info)' }}>
                        {text}
                      </a>
                    ) : (
                      text
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListBlock({ items }) {
  if (!Array.isArray(items) || items.length === 0) return <p className="label">no entries</p>
  return (
    <ul className="list-plain">
      {items.map((item, i) => (
        <li key={i}>{String(item)}</li>
      ))}
    </ul>
  )
}

function countOf(value) {
  if (Array.isArray(value)) return `${value.length} rows`
  if (value && typeof value === 'object') return `${Object.keys(value).length} fields`
  return ''
}

function Block({ spec, data }) {
  const [open, setOpen] = useState(true)
  const empty =
    data === undefined ||
    data === null ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0)

  return (
    <section className={`block result-block-${spec.kind}`}>
      <button type="button" className={`block-head${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <Icon name="chevron" size={13} className="caret" />
        <span className="label" style={{ color: 'var(--text)' }}>
          {spec.title}
        </span>
        <span className="count">{empty ? 'empty' : countOf(data)}</span>
      </button>
      {open && (
        <div className="block-body">
          {empty && <p className="label">nothing returned</p>}
          {!empty && spec.kind === 'kv' && <KvBlock data={data} />}
          {!empty && spec.kind === 'table' && <TableBlock rows={data} columns={spec.columns} />}
          {!empty && spec.kind === 'list' && <ListBlock items={data} />}
          {!empty && spec.kind === 'text' && <pre className="code">{String(data)}</pre>}
          {!empty && spec.kind === 'json' && <pre className="code">{JSON.stringify(data, null, 2)}</pre>}
        </div>
      )}
    </section>
  )
}

export default function ResultView({ mod, result, target }) {
  const [raw, setRaw] = useState(false)
  const navigate = useNavigate()
  const blocks = result?.blocks || {}
  const meta = result?.meta || {}

  const exportJson = () => {
    const payload = {
      module: mod.id,
      target: target || null,
      generatedAt: new Date().toISOString(),
      meta,
      blocks,
    }
    download(`openeyes-${mod.id}-${slug(target) || 'result'}.json`, JSON.stringify(payload, null, 2))
  }

  const exportCsv = () => {
    const tableSpec = mod.blocks.find((b) => b.kind === 'table' && Array.isArray(blocks[b.key]))
    if (!tableSpec) return
    download(
      `openeyes-${mod.id}-${slug(target) || 'result'}.csv`,
      toCsv(blocks[tableSpec.key]),
      'text/csv',
    )
  }

  const addToMap = () => {
    try {
      const payload = { module: mod.id, moduleName: mod.name, target: target || '', blocks }
      localStorage.setItem('openeyes:map-draft', JSON.stringify(payload))
      navigate('/panel/map')
    } catch {}
  }

  const hasTable = mod.blocks.some((b) => b.kind === 'table' && Array.isArray(blocks[b.key]) && blocks[b.key].length)

  return (
    <div className="panel fade-up result-shell">
      <div className="panel-head result-head">
        <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
        <span className="label">Result</span>
        {meta.source === 'live' && <span className="tag tag-accent">live</span>}
        {meta.durationMs !== undefined && <span className="tag">{duration(meta.durationMs)}</span>}
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setRaw((r) => !r)}>
          {raw ? 'Blocks' : 'Raw'}
        </button>
        {hasTable && (
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
            <Icon name="download" size={13} />
            CSV
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={addToMap}><Icon name="branch" size={12}/> Add to OSINT Map</button>
        <Link className="btn btn-ghost btn-sm" to="/panel/map">Open Map</Link>
        <button className="btn btn-ghost btn-sm" onClick={exportJson}>
          <Icon name="download" size={13} />
          JSON
        </button>
      </div>

      {raw ? (
        <div className="panel-body">
          <pre className="code">{JSON.stringify(result?.raw ?? blocks, null, 2)}</pre>
        </div>
      ) : (
        <>
          {mod.blocks.map((spec) => <Block key={spec.key} spec={spec} data={blocks[spec.key]} />)}
          {Object.prototype.hasOwnProperty.call(blocks, 'database') && (
            <Block
              key="database"
              spec={{ key: 'database', title: 'Database API', kind: 'kv' }}
              data={blocks.database}
            />
          )}
        </>
      )}
    </div>
  )
}
