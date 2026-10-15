import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import QueryForm from '../components/QueryForm.jsx'
import ResultView from '../components/ResultView.jsx'
import { getModule, defaultValues, targetField } from '../data/modules.js'
import { runModule } from '../lib/providers.js'
import { useStore } from '../state/store.jsx'
import { useAuth } from '../state/auth.jsx'

export default function ModulePage() {
  const { moduleId } = useParams()
  const mod = getModule(moduleId)
  const { settings, target, setTarget, results, dispatch } = useStore()
  const { reload } = useAuth()
  const abortRef = useRef(null)

  const stored = results[moduleId]
  const [values, setValues] = useState(() => (mod ? { ...defaultValues(mod), ...(stored?.values || {}) } : {}))

  useEffect(() => {
    if (!mod) return
    const base = { ...defaultValues(mod) }
    setValues(base)
    setTarget('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId])

  const running = stored?.status === 'running'

  const run = async () => {
    const startedAt = Date.now()
    const bind = targetField(mod)
    const usedTarget = bind ? values[bind.name] : target
    if (bind && usedTarget && usedTarget !== target) setTarget(usedTarget)

    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'run:start', moduleId: mod.id, values })

    try {
      const result = await runModule({ mod, values, signal: controller.signal })
      dispatch({ type: 'run:done', moduleId: mod.id, result, startedAt, values, target: usedTarget })
      reload()
    } catch (err) {
      if (err.code === 'quota_exceeded') reload()
      dispatch({
        type: 'run:error',
        moduleId: mod.id,
        error: { message: err.message, code: err.code, detail: err.detail },
        startedAt,
        values,
        target: usedTarget,
      })
    } finally {
      abortRef.current = null
    }
  }

  const cancel = () => abortRef.current?.abort()

  const rightPane = useMemo(() => {
    if (!mod) return null

    if (running) {
      return (
        <div className="panel">
          <div className="panel-head">
            <span className="label">Running</span>
          </div>
          <div className="scan-line" />
          <div className="empty-state">
            <span className="loader-uiverse" aria-label="Searching" />
            <p>Working. This fills in the moment the module answers.</p>
            <button className="btn btn-sm" onClick={cancel}>
              <Icon name="stop" size={12} />
              Cancel
            </button>
          </div>
        </div>
      )
    }

    if (stored?.status === 'error') {
      return (
        <div className="panel fade-up">
          <div className="panel-head">
            <Icon name="alert" size={14} style={{ color: 'var(--danger)' }} />
            <span className="label">Failed</span>
          </div>
          <div className="panel-body">
            <div className="notice notice-danger">
              <Icon name="alert" size={14} />
              <span>
                <strong>{stored.error?.message}</strong>
                {stored.error?.detail ? <div style={{ marginTop: 6 }}>{String(stored.error.detail)}</div> : null}
              </span>
            </div>
            <p className="page-sub" style={{ marginTop: 14 }}>
              {stored.error?.code === 'network' || stored.error?.code === 'timeout' ? (
                'The server did not answer. Start the API with npm run api:dev, or check your connection.'
              ) : stored.error?.code === 'quota_exceeded' ? (
                'That is all the searches your plan allows today. The count resets at midnight UTC.'
              ) : stored.error?.code === 'not_available' ? (
                'This module is not wired to a live source yet. The network, hash, IBAN, email and archive modules run for real.'
              ) : (
                'Check the input, then run it again.'
              )}
            </p>
          </div>
        </div>
      )
    }

    if (stored?.status === 'done') {
      return <ResultView mod={mod} result={stored} target={target} />
    }

    return (
      <div className="panel">
        <div className="panel-head">
          <span className="label">Result</span>
        </div>
        <div className="empty-state">
          <span className="ring">
            <Icon name={mod.icon} size={17} />
          </span>
          <p>{mod.description}</p>
          <p className="label">fill the form and run it</p>
        </div>
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, stored, running, settings.apiBaseUrl, target])

  if (!mod) {
    return (
      <div className="empty-state">
        <span className="ring">
          <Icon name="alert" size={17} />
        </span>
        <p>No module goes by “{moduleId}”.</p>
        <Link className="btn btn-sm" to="/panel">
          Back to the dashboard
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <span className="module-icon">
          <Icon name={mod.icon} size={17} />
        </span>
        <div>
          <h1 className="page-title">
            {mod.name}
            <span className="tag">{mod.group}</span>
            {mod.authorised && <span className="tag tag-warn">permission needed</span>}
          </h1>
          <p className="page-sub">{mod.description}</p>
          {mod.apiSource && <div className="api-source-chip"><Icon name="globe" size={10}/><span><b>{mod.apiSource.name}</b> · {mod.apiSource.description}</span></div>}
        </div>
      </div>

      <div className="work-split">
        <QueryForm mod={mod} values={values} onChange={setValues} onRun={run} onCancel={cancel} running={running} />
        {rightPane}
      </div>
    </>
  )
}
