const TYPE_RULES = [
  ['Email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['IP', /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
  ['Website', /^https?:\/\//i],
  ['Domain', /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/.*)?$/i],
  ['Discord', /discord|snowflake|guild/i],
  ['Username', /user(name)?|handle|alias|screen.?name/i],
  ['Password', /pass(word)?|secret|token|api.?key/i],
  ['Location', /location|city|country|address|lat|lng|latitude|longitude/i],
  ['Organization', /org(anization)?|company|issuer|asn|provider/i],
  ['Social', /social|profile|platform|tiktok|snapchat|telegram|instagram/i],
]

export const MAP_TYPES = ['Person', 'Email', 'Username', 'Password', 'Domain', 'Website', 'IP', 'Discord', 'Social', 'Organization', 'Location', 'Other']

export function inferType(key, value) {
  const k = String(key ?? '').trim()
  const text = String(value ?? '').trim()
  for (const [type, rule] of TYPE_RULES) {
    if (rule.test(k) || rule.test(text)) return type
  }
  return 'Other'
}

export function categorizeResult(blocks = {}, moduleName = 'Search result', target = '') {
  const groups = new Map()
  const add = (type, value, source = moduleName) => {
    const clean = String(value ?? '').trim()
    if (!clean || clean === '—' || clean === '-') return
    if (!groups.has(type)) groups.set(type, [])
    const list = groups.get(type)
    if (!list.some((item) => String(item.value).toLowerCase() === clean.toLowerCase())) {
      list.push({ id: crypto.randomUUID(), label: clean, value: clean, source, type })
    }
  }

  if (target) add(inferType('target', target), target, moduleName)

  const walk = (key, value) => {
    if (Array.isArray(value)) return value.forEach((item) => walk(key, item))
    if (value && typeof value === 'object') return Object.entries(value).forEach(([childKey, childValue]) => walk(childKey, childValue))
    if (value !== null && value !== undefined && value !== '') add(inferType(key, value), value, key || moduleName)
  }
  Object.entries(blocks || {}).forEach(([key, value]) => walk(key, value))

  return [...groups.entries()].map(([name, items]) => ({ id: name.toLowerCase(), name, color: '#ffffff', items }))
}

export function blankMap() {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    categories: MAP_TYPES.map((name) => ({ id: name.toLowerCase(), name, color: '#ffffff', items: [] })),
    nodes: [],
    connections: [],
  }
}

function edgeExists(edges, from, to) {
  return edges.some((e) => {
    const a = e.from || e[0]
    const b = e.to || e[1]
    return (a === from && b === to) || (a === to && b === from)
  })
}

export function addResultToMapData(data, result) {
  const next = JSON.parse(JSON.stringify(data || blankMap()))
  next.categories = Array.isArray(next.categories) ? next.categories : []
  next.nodes = Array.isArray(next.nodes) ? next.nodes : []
  next.connections = Array.isArray(next.connections) ? next.connections : []

  // Upgrade old tuple edges to the richer edge format.
  next.connections = next.connections.map((e) => Array.isArray(e) ? ({ id: crypto.randomUUID(), from: e[0], to: e[1], label: '' }) : ({ id: e.id || crypto.randomUUID(), ...e }))

  const groups = categorizeResult(result?.blocks, result?.moduleName || result?.module || 'Search result', result?.target)
  const targetValue = String(result?.target || '').trim()
  let targetNode = targetValue ? next.nodes.find((n) => String(n.value).toLowerCase() === targetValue.toLowerCase()) : null

  if (targetValue && !targetNode) {
    const type = inferType('target', targetValue)
    let category = next.categories.find((c) => c.name.toLowerCase() === type.toLowerCase())
    if (!category) {
      category = { id: crypto.randomUUID(), name: type, color: '#ffffff', items: [] }
      next.categories.push(category)
    }
    const item = { id: crypto.randomUUID(), label: targetValue, value: targetValue, source: result?.moduleName || result?.module || 'Search result', type }
    category.items ||= []
    if (!category.items.some((x) => String(x.value).toLowerCase() === targetValue.toLowerCase())) category.items.push(item)
    targetNode = {
      id: crypto.randomUUID(), categoryId: category.id, type, label: targetValue, value: targetValue,
      source: result?.moduleName || result?.module || 'Search result', x: 720, y: 420,
    }
    next.nodes.push(targetNode)
  }

  const importedIds = []
  let index = next.nodes.length
  for (const group of groups) {
    let category = next.categories.find((c) => c.name.toLowerCase() === group.name.toLowerCase())
    if (!category) {
      category = { id: crypto.randomUUID(), name: group.name, color: '#ffffff', items: [] }
      next.categories.push(category)
    }
    category.items ||= []

    for (const item of group.items) {
      if (!category.items.some((x) => String(x.value).toLowerCase() === String(item.value).toLowerCase())) category.items.push(item)
      let node = next.nodes.find((n) => String(n.value).toLowerCase() === String(item.value).toLowerCase())
      if (!node) {
        node = {
          id: crypto.randomUUID(), categoryId: category.id, type: group.name, label: item.label, value: item.value,
          source: item.source, x: 140 + (index % 6) * 230, y: 100 + Math.floor(index / 6) * 150,
        }
        next.nodes.push(node)
        index += 1
      }
      importedIds.push(node.id)
    }
  }

  if (targetNode) {
    for (const id of [...new Set(importedIds)]) {
      if (id !== targetNode.id && !edgeExists(next.connections, targetNode.id, id)) {
        next.connections.push({ id: crypto.randomUUID(), from: targetNode.id, to: id, label: '' })
      }
    }
  }
  return next
}
