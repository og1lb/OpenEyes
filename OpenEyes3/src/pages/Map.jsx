import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { call } from '../lib/session.js'
import { addResultToMapData, blankMap, MAP_TYPES } from '../lib/map.js'

const COLORS = ['#ffffff', '#9ca3af', '#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#f97316']
const MODES = [
  ['select', 'cursor', 'Select'],
  ['connect', 'branch', 'Connect'],
  ['pan', 'move', 'Pan'],
]

function normalizeMap(map) {
  const base = blankMap()
  return {
    ...map,
    data: {
      ...base,
      ...(map?.data || {}),
      categories: Array.isArray(map?.data?.categories) ? map.data.categories : base.categories,
      nodes: Array.isArray(map?.data?.nodes) ? map.data.nodes : [],
      connections: Array.isArray(map?.data?.connections) ? map.data.connections : [],
      viewport: { ...base.viewport, ...(map?.data?.viewport || {}) },
    },
  }
}

export default function MapPage() {
  const [maps, setMaps] = useState([])
  const [active, setActive] = useState(null)
  const [name, setName] = useState('New investigation')
  const [draft, setDraft] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [linkFrom, setLinkFrom] = useState(null)
  const [mode, setMode] = useState('select')
  const [newCat, setNewCat] = useState('')
  const [newItem, setNewItem] = useState('')
  const [newItemType, setNewItemType] = useState('Other')
  const [newColor, setNewColor] = useState('#ffffff')
  const [zoom, setZoom] = useState(1)
  const [collapsedResults, setCollapsedResults] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState(null)
  const board = useRef(null)

  const load = async () => {
    try {
      const d = await call('/api/maps')
      setMaps((d.maps || []).map(normalizeMap))
    } catch {}
  }

  useEffect(() => {
    load()
    try {
      const raw = localStorage.getItem('openeyes:map-draft')
      if (raw) setDraft(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    if (!active && maps.length) {
      const first = normalizeMap(maps[0])
      setActive(first)
      setSelectedCategory(first.data.categories[0]?.id || null)
    }
  }, [maps, active])

  useEffect(() => {
    if (!draft) return
    let cancelled = false
    ;(async () => {
      let base = active
      if (!base) base = await createMap(`Search · ${draft.moduleName || draft.module || 'result'}`)
      if (cancelled) return
      const data = addResultToMapData(base.data, draft)
      setActive((current) => ({ ...current, data }))
      setSelectedCategory(data.categories.find((c) => c.items?.length)?.id || null)
      setDraft(null)
      localStorage.removeItem('openeyes:map-draft')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  async function createMap(customName = name) {
    const d = await call('/api/maps', { method: 'POST', body: { name: customName || 'Untitled map' } })
    const m = normalizeMap({ id: d.id, name: d.name, data: blankMap() })
    setMaps((current) => [m, ...current])
    setActive(m)
    setSelectedCategory(m.data.categories[0]?.id || null)
    setPan({ x: 0, y: 0 })
    setZoom(1)
    return m
  }

  function updateData(mutator) {
    if (!active) return
    setActive((current) => ({ ...current, data: mutator(current.data) }))
  }

  async function save() {
    if (!active) return
    const data = { ...active.data, viewport: { x: pan.x, y: pan.y, zoom } }
    await call(`/api/maps/${active.id}`, { method: 'PUT', body: { name: active.name, data } })
    setActive((current) => current ? { ...current, data } : current)
    await load()
  }

  async function importDraft() {
    if (!draft) return
    let base = active
    if (!base) base = await createMap(`Search · ${draft.moduleName || 'result'}`)
    const data = addResultToMapData(base.data, draft)
    setActive({ ...base, data })
    setSelectedCategory(data.categories.find((c) => c.items?.length)?.id || null)
    setDraft(null)
    localStorage.removeItem('openeyes:map-draft')
  }

  function addCategory() {
    const label = newCat.trim()
    if (!active || !label) return
    const category = { id: crypto.randomUUID(), name: label.slice(0, 40), color: newColor, items: [] }
    updateData((data) => ({ ...data, categories: [...data.categories, category] }))
    setSelectedCategory(category.id)
    setNewCat('')
  }

  function editCategory(category) {
    const next = prompt('Category name', category.name)
    if (!next?.trim()) return
    updateData((data) => ({ ...data, categories: data.categories.map((c) => c.id === category.id ? { ...c, name: next.trim().slice(0, 40) } : c) }))
  }

  function deleteCategory(id) {
    const category = active?.data.categories.find((c) => c.id === id)
    if (!category || !confirm(`Delete category “${category.name}” and all its entries?`)) return
    const ids = new Set((active.data.nodes || []).filter((n) => n.categoryId === id).map((n) => n.id))
    updateData((data) => ({
      ...data,
      categories: data.categories.filter((c) => c.id !== id),
      nodes: data.nodes.filter((n) => n.categoryId !== id),
      connections: data.connections.filter((c) => !ids.has(c[0]) && !ids.has(c[1])),
    }))
    if (selectedCategory === id) setSelectedCategory(null)
  }

  function addItem() {
    const value = newItem.trim()
    const category = active?.data.categories.find((c) => c.id === selectedCategory)
    if (!category || !value) return
    const id = crypto.randomUUID()
    const index = active.data.nodes.length
    const item = { id, label: value.slice(0, 180), value: value.slice(0, 180), source: 'manual', type: newItemType }
    const node = {
      id: crypto.randomUUID(), categoryId: category.id, type: newItemType,
      label: item.label, value: item.value, source: 'manual',
      x: 80 + (index % 5) * 220, y: 80 + Math.floor(index / 5) * 135,
    }
    updateData((data) => ({
      ...data,
      categories: data.categories.map((c) => c.id === category.id ? { ...c, items: [...(c.items || []), item] } : c),
      nodes: [...data.nodes, node],
    }))
    setNewItem('')
    setSelectedNode(node.id)
  }

  function editItem(categoryId, itemId) {
    const category = active?.data.categories.find((c) => c.id === categoryId)
    const item = category?.items?.find((i) => i.id === itemId)
    if (!item) return
    const value = prompt('Edit value', item.value)
    if (value === null || !value.trim()) return
    const clean = value.trim().slice(0, 180)
    updateData((data) => ({
      ...data,
      categories: data.categories.map((c) => c.id === categoryId ? { ...c, items: c.items.map((i) => i.id === itemId ? { ...i, label: clean, value: clean } : i) } : c),
      nodes: data.nodes.map((n) => n.categoryId === categoryId && n.value === item.value ? { ...n, label: clean, value: clean } : n),
    }))
  }

  function deleteItem(categoryId, itemId) {
    const category = active?.data.categories.find((c) => c.id === categoryId)
    const item = category?.items?.find((i) => i.id === itemId)
    if (!item) return
    const ids = new Set(active.data.nodes.filter((n) => n.categoryId === categoryId && n.value === item.value).map((n) => n.id))
    updateData((data) => ({
      ...data,
      categories: data.categories.map((c) => c.id === categoryId ? { ...c, items: (c.items || []).filter((i) => i.id !== itemId) } : c),
      nodes: data.nodes.filter((n) => !ids.has(n.id)),
      connections: data.connections.filter((c) => !ids.has(c[0]) && !ids.has(c[1])),
    }))
  }

  function connectNode(id) {
    if (!active) return
    if (!linkFrom) {
      setLinkFrom(id)
      setSelectedNode(id)
      return
    }
    if (linkFrom === id) {
      setLinkFrom(null)
      return
    }
    updateData((data) => {
      const exists = data.connections.some((c) => (c[0] === linkFrom && c[1] === id) || (c[0] === id && c[1] === linkFrom))
      return exists ? data : { ...data, connections: [...data.connections, { id: crypto.randomUUID(), from: linkFrom, to: id, label: '' }] }
    })
    setLinkFrom(null)
  }

  function editConnection(edge) {
    const label = prompt('Relationship label (optional)', edge.label || '')
    if (label === null) return
    updateData((data) => ({ ...data, connections: data.connections.map((c) => c.id === edge.id ? { ...c, label: label.slice(0, 80) } : c) }))
  }

  function removeConnection(edgeId) {
    updateData((data) => ({ ...data, connections: data.connections.filter((c) => c.id !== edgeId) }))
  }

  function moveNode(id, clientX, clientY) {
    if (!board.current || !active) return
    const rect = board.current.getBoundingClientRect()
    const x = Math.max(20, (clientX - rect.left - pan.x) / zoom - drag.dx)
    const y = Math.max(20, (clientY - rect.top - pan.y) / zoom - drag.dy)
    updateData((data) => ({ ...data, nodes: data.nodes.map((n) => n.id === id ? { ...n, x, y } : n) }))
  }

  function pointerDown(e, node) {
    if (e.button !== 0) return
    if (mode === 'connect') {
      e.stopPropagation()
      connectNode(node.id)
      return
    }
    if (mode !== 'select') return
    const rect = board.current.getBoundingClientRect()
    setSelectedNode(node.id)
    setDrag({ kind: 'node', id: node.id, dx: (e.clientX - rect.left - pan.x) / zoom - node.x, dy: (e.clientY - rect.top - pan.y) / zoom - node.y })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function boardDown(e) {
    if (e.button !== 0 || mode !== 'pan') return
    setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y })
  }

  function pointerMove(e) {
    if (!drag) return
    if (drag.kind === 'node') moveNode(drag.id, e.clientX, e.clientY)
    if (drag.kind === 'pan') setPan({ x: drag.px + e.clientX - drag.sx, y: drag.py + e.clientY - drag.sy })
  }

  const categories = active?.data.categories || []
  const nodes = active?.data.nodes || []
  const connections = active?.data.connections || []
  const nodeBy = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const selected = categories.find((c) => c.id === selectedCategory) || categories[0]

  return <>
    <div className="page-head">
      <span className="module-icon"><Icon name="branch" size={18}/></span>
      <div><span className="eyebrow">OPEN EYES / OSINT / RELATIONSHIP WORKSPACE</span><h1 className="page-title">OSINT Map</h1><p className="page-sub">Build investigations visually. Create your own categories, add structured results, move nodes, connect relationships and save the entire canvas.</p></div>
    </div>

    {draft && <div className="map-import-banner"><div><b>Search result ready</b><span>{draft.moduleName || draft.module} · {draft.target || 'multiple findings'} · automatic result classification is ready</span></div><button className="btn btn-primary btn-sm" onClick={importDraft}><Icon name="branch" size={12}/> Auto-build map</button></div>}

    <div className="map-layout map-workbench map-workbench-v4">
      <aside className="map-sidebar map-control-sidebar">
        <div className="map-create"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Map name"/><button className="btn btn-primary" onClick={() => createMap()}><Icon name="branch" size={13}/> New map</button></div>
        <div className="map-section-title">INVESTIGATIONS</div>
        {maps.map((m) => <button className={`map-list-item${active?.id === m.id ? ' active' : ''}`} key={m.id} onClick={() => { const next=normalizeMap(m); setActive(next); setSelectedCategory(next.data.categories[0]?.id || null); setZoom(next.data.viewport.zoom || 1); setPan({x:next.data.viewport.x||0,y:next.data.viewport.y||0}) }}><span>{m.name}</span><small>{m.data?.nodes?.length || 0} nodes · {m.data?.connections?.length || 0} links</small></button>)}
        {active && <>
          <div className="map-toolbar-mini"><button className="btn btn-ghost btn-sm" onClick={() => { const n=prompt('Map name',active.name); if(n?.trim()) setActive({...active,name:n.trim().slice(0,80)}) }}>Rename</button><button className="btn btn-ghost btn-sm danger-btn" onClick={async()=>{if(!confirm('Delete this map?'))return;await call(`/api/maps/${active.id}`,{method:'DELETE'});setActive(null);await load()}}>Delete</button></div>
          <div className="map-section-title">CUSTOM CATEGORIES</div>
          <div className="category-list">{categories.map(c => <div className={`category-row${selected?.id===c.id?' active':''}`} key={c.id} onClick={()=>setSelectedCategory(c.id)}><i style={{background:c.color||'#fff'}}/><span>{c.name}</span><small>{c.items?.length||0}</small><button className="icon-mini" title="Edit category" onClick={(e)=>{e.stopPropagation();editCategory(c)}}><Icon name="edit" size={10}/></button><button className="icon-mini danger-btn" title="Delete category" onClick={(e)=>{e.stopPropagation();deleteCategory(c.id)}}><Icon name="trash" size={10}/></button></div>)}</div>
          <div className="category-create"><input className="input" value={newCat} onChange={(e)=>setNewCat(e.target.value)} placeholder="New category"/><div className="swatches">{COLORS.map(c=><button key={c} aria-label={c} className={newColor===c?'selected':''} style={{background:c}} onClick={()=>setNewColor(c)}/>)}</div><button className="btn btn-sm" onClick={addCategory}>Create category</button></div>
        </>}
      </aside>

      <section className="map-canvas map-workspace-canvas">
        <div className="map-toolbar"><div className="map-modebar">{MODES.map(([id,icon,label])=><button key={id} className={`btn btn-sm ${mode===id?'btn-primary':''}`} onClick={()=>{setMode(id);setLinkFrom(null)}}><Icon name={icon} size={12}/>{label}</button>)}{linkFrom&&<span className="map-connect-hint">Select the second node</span>}</div><div className="map-toolbar-actions"><button className="btn btn-sm" onClick={()=>setZoom(z=>Math.min(2.5,+(z+.1).toFixed(1)))}>+</button><button className="btn btn-sm" onClick={()=>setZoom(z=>Math.max(.35,+(z-.1).toFixed(1)))}>−</button><button className="btn btn-sm" onClick={()=>{setZoom(1);setPan({x:0,y:0})}}>Reset</button>{active&&<button className="btn btn-primary btn-sm" onClick={save}>Save map</button>}</div></div>
        {active ? <div className={`map-board map-board-v4 mode-${mode}`} ref={board} onWheel={(e)=>{e.preventDefault();setZoom(z=>Math.max(.35,Math.min(2.5,+(z*(e.deltaY<0?1.1:0.9)).toFixed(2))))}} onPointerDown={boardDown} onPointerMove={pointerMove} onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)}>
          <div className="map-transform-v4" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}>
            <svg className="map-edges-v4" viewBox="0 0 1600 1000" preserveAspectRatio="none">
              <defs><marker id="oe-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#777"/></marker></defs>
              {connections.map((edge) => { const a=nodeBy[edge.from||edge[0]],b=nodeBy[edge.to||edge[1]];if(!a||!b)return null;const x1=(a.x||0)+80,y1=(a.y||0)+35,x2=(b.x||0)+80,y2=(b.y||0)+35,mx=(x1+x2)/2,my=(y1+y2)/2;return <g key={edge.id||`${edge[0]}-${edge[1]}`}><line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#oe-arrow)"/><text x={mx} y={my-6} onClick={(e)=>{e.stopPropagation();editConnection(edge)}}>{edge.label||'·'}</text><circle cx={mx} cy={my} r="7" onClick={(e)=>{e.stopPropagation();removeConnection(edge.id)}}/></g>})}
            </svg>
            {nodes.map(n=>{const cat=categories.find(c=>c.id===n.categoryId);return <div key={n.id} className={`map-editor-node map-node-pro node-v4${selectedNode===n.id?' selected-node':''}${linkFrom===n.id?' linking':''}`} style={{left:n.x||80,top:n.y||100,borderColor:cat?.color||'#444'}} onPointerDown={(e)=>pointerDown(e,n)} onDoubleClick={()=>{const next=prompt('Edit node value',n.value);if(next?.trim())updateData(data=>({...data,nodes:data.nodes.map(x=>x.id===n.id?{...x,label:next.trim(),value:next.trim()}:x),categories:data.categories.map(c=>({...c,items:(c.items||[]).map(i=>i.value===n.value?{...i,label:next.trim(),value:next.trim()}:i)}))}))}}><div className="node-type" style={{color:cat?.color||'#777'}}>{n.type}</div><b>{n.label}</b><small>{n.source||'manual'} · {cat?.name||'Other'}</small><div className="node-actions"><button onClick={(e)=>{e.stopPropagation();connectNode(n.id)}} title="Connect"><Icon name="branch" size={11}/></button><button onClick={(e)=>{e.stopPropagation();const next=prompt('Edit node value',n.value);if(next?.trim())updateData(data=>({...data,nodes:data.nodes.map(x=>x.id===n.id?{...x,label:next.trim(),value:next.trim()}:x)}))}} title="Edit"><Icon name="edit" size={11}/></button><button onClick={(e)=>{e.stopPropagation();const ids=new Set([n.id]);updateData(data=>({...data,nodes:data.nodes.filter(x=>x.id!==n.id),connections:data.connections.filter(c=>!ids.has(c.from||c[0])&&!ids.has(c.to||c[1])),categories:data.categories.map(c=>({...c,items:(c.items||[]).filter(i=>i.value!==n.value)}))}))}} title="Delete"><Icon name="trash" size={11}/></button></div></div>})}
            {!nodes.length&&<div className="map-empty"><Icon name="branch" size={24}/><b>Build your investigation</b><span>Use Connect to draw relationships, Pan to move the canvas, or import a search result.</span></div>}
          </div>
        </div> : <div className="map-empty"><Icon name="branch" size={24}/><b>Select or create a map.</b><span>Your investigations are private to your account.</span></div>}
      </section>

      <aside className="map-inspector">
        <div className="map-section-title">CATEGORY / RESULTS</div>
        {selected ? <><button className="inspector-category inspector-category-toggle" onClick={()=>setCollapsedResults(v=>!v)} aria-expanded={!collapsedResults}><i style={{background:selected.color||'#fff'}}/><b>{selected.name}</b><span>{selected.items?.length||0} entries</span><Icon name={collapsedResults?'chevron-down':'chevron-up'} size={13}/></button>{!collapsedResults && <><div className="inspector-add"><select className="input" value={newItemType} onChange={e=>setNewItemType(e.target.value)}>{MAP_TYPES.map(t=><option key={t}>{t}</option>)}</select><input className="input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Add result / value" onKeyDown={e=>e.key==='Enter'&&addItem()}/><button className="btn btn-primary btn-sm" onClick={addItem}><Icon name="plus" size={12}/> Add result</button></div><div className="result-entry-list">{(selected.items||[]).map(item=><div className="result-entry" key={item.id}><span className="entry-type">{item.type||selected.name}</span><b>{item.value}</b><small>{item.source||'manual'}</small><div className="entry-actions"><button onClick={()=>editItem(selected.id,item.id)}><Icon name="edit" size={10}/></button><button onClick={()=>deleteItem(selected.id,item.id)}><Icon name="trash" size={10}/></button></div></div>)}{!selected.items?.length&&<p className="label">No results in this category yet.</p>}</div></>}</> : <div className="empty-state"><p>Create or select a category.</p></div>}
      </aside>
    </div>
  </>
}
