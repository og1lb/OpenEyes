const PREFIX = 'openeyes:'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {}
}

export function drop(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {}
}
