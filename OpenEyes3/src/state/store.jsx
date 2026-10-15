import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { load, save } from '../lib/storage.js'
import { countFindings } from '../lib/format.js'

const DEFAULT_SETTINGS = {
  apiBaseUrl: '',
  apiToken: '',
  timeoutMs: 30000,
  theme: 'dark',
  operator: 'operator',
  keys: {},
}

const HISTORY_LIMIT = 60

const initialState = {
  settings: { ...DEFAULT_SETTINGS, ...load('settings', {}) },
  target: load('target', ''),
  history: load('history', []),
  results: {},
}

function reducer(state, action) {
  switch (action.type) {
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'target':
      return { ...state, target: action.target }
    case 'run:start':
      return {
        ...state,
        results: {
          ...state.results,
          [action.moduleId]: { status: 'running', startedAt: Date.now(), values: action.values },
        },
      }
    case 'run:done': {
      const entry = {
        id: `${action.moduleId}-${action.startedAt}`,
        moduleId: action.moduleId,
        target: action.target,
        startedAt: action.startedAt,
        finishedAt: Date.now(),
        findings: countFindings(action.result?.blocks),
        source: action.result?.meta?.source || 'backend',
        status: 'ok',
      }
      return {
        ...state,
        results: {
          ...state.results,
          [action.moduleId]: { status: 'done', ...action.result, startedAt: action.startedAt, values: action.values },
        },
        history: [entry, ...state.history].slice(0, HISTORY_LIMIT),
      }
    }
    case 'run:error': {
      const entry = {
        id: `${action.moduleId}-${action.startedAt}`,
        moduleId: action.moduleId,
        target: action.target,
        startedAt: action.startedAt,
        finishedAt: Date.now(),
        findings: 0,
        source: 'error',
        status: 'error',
        error: action.error,
      }
      return {
        ...state,
        results: {
          ...state.results,
          [action.moduleId]: { status: 'error', error: action.error, startedAt: action.startedAt, values: action.values },
        },
        history: [entry, ...state.history].slice(0, HISTORY_LIMIT),
      }
    }
    case 'clear:result': {
      const results = { ...state.results }
      delete results[action.moduleId]
      return { ...state, results }
    }
    case 'clear:history':
      return { ...state, history: [] }
    default:
      return state
  }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => save('settings', state.settings), [state.settings])
  useEffect(() => save('target', state.target), [state.target])
  useEffect(() => save('history', state.history), [state.history])

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
  }, [state.settings.theme])

  const setSettings = useCallback((patch) => dispatch({ type: 'settings', patch }), [])
  const setTarget = useCallback((target) => dispatch({ type: 'target', target }), [])

  const value = useMemo(
    () => ({ ...state, dispatch, setSettings, setTarget }),
    [state, setSettings, setTarget],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export { DEFAULT_SETTINGS }
