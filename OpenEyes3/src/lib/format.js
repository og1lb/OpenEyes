export function humanKey(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

export function clockTime(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString([], { hour12: false })
}

export function duration(ms) {
  if (ms === undefined || ms === null) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function countFindings(blocks) {
  if (!blocks) return 0
  let total = 0
  for (const value of Object.values(blocks)) {
    if (Array.isArray(value)) total += value.length
    else if (value && typeof value === 'object') total += Object.keys(value).length
    else if (value) total += 1
  }
  return total
}

export function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [columns.join(','), ...rows.map((row) => columns.map((c) => escape(row[c])).join(','))].join('\n')
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}
