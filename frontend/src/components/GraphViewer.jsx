/**
 * GraphViewer — renders the orchestration DAG as an interactive canvas.
 *
 * Uses React Flow (@xyflow/react) for zoom/pan/minimap.
 *
 * Features
 * ────────
 *  • Client-side preset topology expansion (mirrors resolution.py)
 *  • Automatic BFS-based level layout (skips back-edges / return arcs)
 *  • Live status updates from SSE events:
 *      node_start   → "running"  (green pulse)
 *      node_complete → "complete" (solid green)
 *      error        → "failed"   (red)
 *      hitl_pause   → "hitl"     (amber pulse)
 *      hitl_resume  → "running"
 *  • Edge styles: sequential (indigo), conditional (dashed amber), returning (violet)
 *  • Legend + MiniMap + Controls
 */

import { useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ── Status styles ──────────────────────────────────────────────────────────────

const STATUS = {
  idle:     { dot: 'bg-slate-600',          ring: '' },
  running:  { dot: 'bg-green-400 animate-pulse', ring: 'ring-2 ring-green-400/60 ring-offset-1 ring-offset-slate-900' },
  complete: { dot: 'bg-green-600',          ring: 'ring-1 ring-green-700/50' },
  failed:   { dot: 'bg-red-500',            ring: 'ring-2 ring-red-500/60' },
  hitl:     { dot: 'bg-amber-400 animate-pulse', ring: 'ring-2 ring-amber-400/60 ring-offset-1 ring-offset-slate-900' },
}

// ── Role → visual style ────────────────────────────────────────────────────────

const ROLE_STYLE = {
  system:      { bg: '#1e293b', border: '#475569', text: '#94a3b8' },
  agent:       { bg: '#1e293b', border: '#4f46e5', text: '#a5b4fc' },
  main:        { bg: '#1e1b4b', border: '#6366f1', text: '#c7d2fe' },
  sub_agent:   { bg: '#172554', border: '#3b82f6', text: '#93c5fd' },
  supervisor:  { bg: '#1c1400', border: '#d97706', text: '#fcd34d' },
  subordinate: { bg: '#1c0f00', border: '#f97316', text: '#fdba74' },
  team_member: { bg: '#052e16', border: '#16a34a', text: '#86efac' },
  merge:       { bg: '#1e0a3c', border: '#7c3aed', text: '#c4b5fd' },
}

// ── Custom node: agent box ─────────────────────────────────────────────────────

function AgentNode({ data }) {
  const { label, sublabel, role, status = 'idle', tokens } = data
  const style  = ROLE_STYLE[role] || ROLE_STYLE.agent
  const stat   = STATUS[status]   || STATUS.idle

  const handleStyle = { background: style.border, width: 8, height: 8, border: 'none' }

  return (
    <div
      className={`relative rounded-lg shadow-lg transition-shadow ${stat.ring}`}
      style={{
        minWidth: 140,
        maxWidth: 190,
        background: style.bg,
        border: `1.5px solid ${style.border}`,
      }}
    >
      {/* Top handle — receives forward edges */}
      <Handle type="target" position={Position.Top}    style={handleStyle} />
      {/* Bottom handle — emits forward edges */}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      {/* Side handles — used for return arcs */}
      <Handle type="source" id="r" position={Position.Right} style={{ ...handleStyle, width: 6, height: 6 }} />
      <Handle type="target" id="l" position={Position.Left}  style={{ ...handleStyle, width: 6, height: 6 }} />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${stat.dot}`} />
          <span className="text-xs font-semibold truncate" style={{ color: style.text }}>
            {label}
          </span>
        </div>
        {sublabel && (
          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug truncate">{sublabel}</p>
        )}
        {tokens != null && (
          <p className="text-[10px] text-slate-600 mt-0.5">{tokens.toLocaleString()} tok</p>
        )}
      </div>
    </div>
  )
}

// ── Custom node: __start__ / __end__ pill ──────────────────────────────────────

function SystemNode({ data }) {
  return (
    <div
      className="flex items-center justify-center px-4 py-1.5 rounded-full shadow"
      style={{ background: '#0f172a', border: '1.5px solid #475569' }}
    >
      <Handle type="target" position={Position.Top}    style={{ background: '#475569', width: 7, height: 7, border: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#475569', width: 7, height: 7, border: 'none' }} />
      <span className="text-xs font-mono text-slate-400">{data.label}</span>
    </div>
  )
}

const NODE_TYPES = { agentNode: AgentNode, systemNode: SystemNode }

// ── Client-side preset expansion ───────────────────────────────────────────────
// Mirrors resolution.py logic — produces {id, role, label} for nodes and
// {id, from, to, returning?, conditional?, loop?} for edges.

function expandPreset(preset) {
  const pid     = preset.preset_id
  const pattern = preset.pattern
  const nodes   = []
  const edges   = []

  if (pattern === 'main_sub_agent') {
    const mainRaw = preset.main_agent
    const subsRaw = preset.sub_agents || []
    const mainId  = `${pid}_${mainRaw.agent_id}`

    nodes.push({ id: mainId, role: 'main', label: mainRaw.name || mainRaw.agent_id, sublabel: 'main agent' })
    edges.push({ id: `${pid}_start`, from: '__start__', to: mainId })

    for (const subEntry of subsRaw) {
      const agRaw = subEntry.agent || subEntry
      const saId  = `${pid}_${agRaw.agent_id}`
      nodes.push({ id: saId, role: 'sub_agent', label: agRaw.name || agRaw.agent_id, sublabel: 'sub-agent' })
      edges.push({ id: `${pid}_to_${agRaw.agent_id}`,       from: mainId, to: saId,   conditional: true })
      edges.push({ id: `${pid}_${agRaw.agent_id}_return`,   from: saId,  to: mainId,  returning: true })
    }

    edges.push({ id: `${pid}_exit`, from: mainId, to: '__end__', conditional: true })
    edges.push({ id: `${pid}_loop`, from: mainId, to: mainId,    loop: true })

  } else if (pattern === 'team') {
    const members   = preset.members || []
    const mergeRaw  = preset.merge_agent
    const strategy  = preset.merge_strategy || 'concatenate'
    const memberIds = []

    for (const m of members) {
      const ma  = m.agent || m
      const nid = `${pid}_${ma.agent_id}`
      memberIds.push(nid)
      nodes.push({ id: nid, role: 'team_member', label: ma.name || ma.agent_id, sublabel: 'member' })
    }

    let prev = '__start__'
    for (const nid of memberIds) {
      edges.push({ id: `${pid}_e_${prev}_${nid}`, from: prev, to: nid })
      prev = nid
    }

    if (strategy === 'summarize' && mergeRaw) {
      const mergeId = `${pid}_merge`
      nodes.push({ id: mergeId, role: 'merge', label: mergeRaw.name || mergeRaw.agent_id, sublabel: 'merge' })
      edges.push({ id: `${pid}_to_merge`,  from: prev,    to: mergeId })
      edges.push({ id: `${pid}_merge_end`, from: mergeId, to: '__end__' })
    } else {
      edges.push({ id: `${pid}_end`, from: prev, to: '__end__' })
    }

  } else if (pattern === 'hierarchical') {
    const levels = preset.levels || []
    let topSupId = null

    for (let li = 0; li < levels.length; li++) {
      const lvl    = levels[li]
      const sup    = lvl.supervisor
      const supId  = `${pid}_${sup.agent_id}`

      if (li === 0) {
        topSupId = supId
        nodes.push({ id: supId, role: 'supervisor', label: sup.name || sup.agent_id, sublabel: 'supervisor' })
        edges.push({ id: `${pid}_start`, from: '__start__', to: supId })
      } else {
        nodes.push({ id: supId, role: 'supervisor', label: sup.name || sup.agent_id, sublabel: 'supervisor (L2)' })
      }

      for (const subEntry of (lvl.subordinates || [])) {
        const sub   = subEntry.agent || subEntry
        const subId = `${pid}_${sub.agent_id}`
        nodes.push({ id: subId, role: 'subordinate', label: sub.name || sub.agent_id, sublabel: 'subordinate' })
        edges.push({ id: `${pid}_${sup.agent_id}_to_${sub.agent_id}`, from: supId, to: subId })
        edges.push({ id: `${pid}_${sub.agent_id}_return`,             from: subId, to: supId, returning: true })
      }
    }

    if (topSupId) {
      edges.push({ id: `${pid}_end`, from: topSupId, to: '__end__', conditional: true })
    }
  }

  return { nodes, edges }
}

// ── Topology: config → flat node/edge lists ────────────────────────────────────

function deriveTopology(config) {
  const graphNodes = [
    { id: '__start__', role: 'system', label: '__start__' },
    { id: '__end__',   role: 'system', label: '__end__' },
  ]
  const graphEdges = []

  // Explicit nodes
  for (const n of (config.nodes || [])) {
    graphNodes.push({
      id:      n.node_id,
      role:    'agent',
      label:   n.agent?.name || n.node_id,
      sublabel: n.agent?.description?.slice(0, 50),
    })
  }

  // Explicit edges
  for (const e of (config.edges || [])) {
    const from = e.from || e.from_node
    const to   = e.to   || e.to_node
    graphEdges.push({
      id:          e.edge_id,
      from,
      to,
      conditional: !!e.condition,
      loop:        from === to,
    })
  }

  // Preset expansions
  for (const preset of (config.presets || [])) {
    const { nodes, edges } = expandPreset(preset)
    graphNodes.push(...nodes)
    graphEdges.push(...edges)
  }

  return { graphNodes, graphEdges }
}

// ── BFS-based level assignment ─────────────────────────────────────────────────
// Skips self-loops and "returning" arcs so the layout reads top-to-bottom.
// Uses a relaxation approach: if we discover a longer path to a node, update it.

function assignLevels(graphNodes, graphEdges) {
  const levels = new Map()
  const adj    = new Map()

  for (const n of graphNodes) adj.set(n.id, [])

  for (const e of graphEdges) {
    if (!e.loop && !e.returning) {
      adj.get(e.from)?.push(e.to)
    }
  }

  const queue = ['__start__']
  levels.set('__start__', 0)

  while (queue.length > 0) {
    const cur      = queue.shift()
    const curLevel = levels.get(cur) ?? 0

    for (const next of (adj.get(cur) || [])) {
      const newLevel = curLevel + 1
      if (!levels.has(next) || levels.get(next) < newLevel) {
        levels.set(next, newLevel)
        queue.push(next)
      }
    }
  }

  // Assign fallback level for any unreachable nodes
  let maxLevel = Math.max(...levels.values(), 0)
  for (const n of graphNodes) {
    if (!levels.has(n.id)) levels.set(n.id, maxLevel + 1)
  }

  return levels
}

// ── Layout: levels → (x, y) positions ─────────────────────────────────────────

const NODE_W = 185
const NODE_H = 65
const H_GAP  = 35
const V_GAP  = 70

function computePositions(graphNodes, graphEdges) {
  const levelMap     = assignLevels(graphNodes, graphEdges)
  const byLevel      = new Map()

  for (const n of graphNodes) {
    const lvl = levelMap.get(n.id) ?? 0
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl).push(n.id)
  }

  const positions = new Map()
  const sortedLvls = [...byLevel.keys()].sort((a, b) => a - b)

  for (const lvl of sortedLvls) {
    const ids   = byLevel.get(lvl)
    const total = ids.length * NODE_W + (ids.length - 1) * H_GAP
    const startX = -total / 2
    const y      = lvl * (NODE_H + V_GAP)

    for (let i = 0; i < ids.length; i++) {
      positions.set(ids[i], { x: startX + i * (NODE_W + H_GAP), y })
    }
  }

  return positions
}

// ── Event → node status map ────────────────────────────────────────────────────

function deriveNodeStatuses(events) {
  const statuses = new Map()

  for (const ev of events) {
    const { event_type, node_id, payload } = ev
    if (!node_id) continue

    if      (event_type === 'node_start')    statuses.set(node_id, 'running')
    else if (event_type === 'node_complete') {
      statuses.set(node_id, 'complete')
      if (payload?.token_usage?.total_tokens != null) {
        statuses.set(`${node_id}__tokens`, payload.token_usage.total_tokens)
      }
    }
    else if (event_type === 'error')         statuses.set(node_id, 'failed')
    else if (event_type === 'hitl_pause')    statuses.set(node_id, 'hitl')
    else if (event_type === 'hitl_resume')   statuses.set(node_id, 'running')
  }

  return statuses
}

// ── Track currently active edge transitions from routing_decision events ───────

function deriveActiveEdges(events) {
  const active = new Set()
  for (const ev of events) {
    if (ev.event_type === 'routing_decision' && ev.payload?.selected_node) {
      active.add(`${ev.node_id}->${ev.payload.selected_node}`)
    }
  }
  return active
}

// ── Build React Flow nodes + edges ─────────────────────────────────────────────

function buildFlowElements(graphNodes, graphEdges, positions, nodeStatuses, activeEdges) {
  const rfNodes = graphNodes.map(n => ({
    id:       n.id,
    type:     n.role === 'system' ? 'systemNode' : 'agentNode',
    position: positions.get(n.id) || { x: 0, y: 0 },
    data: {
      label:    n.label,
      sublabel: n.sublabel,
      role:     n.role,
      status:   nodeStatuses.get(n.id) || 'idle',
      tokens:   nodeStatuses.get(`${n.id}__tokens`) ?? null,
    },
  }))

  const rfEdges = graphEdges
    .filter(e => !e.loop)   // skip self-loops (shown as "↻" in legend text)
    .map(e => {
      const fromStatus   = nodeStatuses.get(e.from) || 'idle'
      const isAnimated   = fromStatus === 'running' || activeEdges.has(`${e.from}->${e.to}`)
      const isConditional = e.conditional
      const isReturning  = e.returning

      const color = isReturning   ? '#7c3aed'
                  : isConditional ? '#d97706'
                  : '#4f46e5'

      return {
        id:     e.id,
        source: e.from,
        target: e.to,
        // Use side handles for return arcs so they visually arc around
        ...(isReturning ? { sourceHandle: 'r', targetHandle: 'l' } : {}),
        type:     'smoothstep',
        animated: isAnimated,
        style: {
          stroke:           color,
          strokeWidth:      isConditional ? 1 : 1.5,
          strokeDasharray:  isConditional ? '5 3' : undefined,
        },
        markerEnd: {
          type:   MarkerType.ArrowClosed,
          width:  12,
          height: 12,
          color,
        },
      }
    })

  return { rfNodes, rfEdges }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GraphViewer({ config, events }) {
  const { graphNodes, graphEdges } = useMemo(() => deriveTopology(config), [config])
  const positions    = useMemo(() => computePositions(graphNodes, graphEdges), [graphNodes, graphEdges])
  const nodeStatuses = useMemo(() => deriveNodeStatuses(events), [events])
  const activeEdges  = useMemo(() => deriveActiveEdges(events), [events])

  const { rfNodes, rfEdges } = useMemo(
    () => buildFlowElements(graphNodes, graphEdges, positions, nodeStatuses, activeEdges),
    [graphNodes, graphEdges, positions, nodeStatuses, activeEdges]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  // Sync whenever derived elements change
  useEffect(() => { setNodes(rfNodes) }, [rfNodes])  // eslint-disable-line
  useEffect(() => { setEdges(rfEdges) }, [rfEdges])  // eslint-disable-line

  return (
    <div className="w-full h-full" style={{ background: '#020817' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={22} size={1} />
        <Controls
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
          }}
        />
        <MiniMap
          style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
          nodeColor={(n) => {
            const s = n.data?.status
            if (s === 'running')  return '#22c55e'
            if (s === 'complete') return '#16a34a'
            if (s === 'failed')   return '#ef4444'
            if (s === 'hitl')     return '#f59e0b'
            return '#334155'
          }}
          zoomable
          pannable
        />

        {/* ── Legend ── */}
        <Panel position="top-right">
          <div
            className="text-xs"
            style={{
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '12px 14px',
              minWidth: 140,
              backdropFilter: 'blur(4px)',
            }}
          >
            <p style={{ color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Status</p>
            {[
              { cls: 'bg-green-400',  label: 'Running' },
              { cls: 'bg-green-600',  label: 'Complete' },
              { cls: 'bg-red-500',    label: 'Failed' },
              { cls: 'bg-amber-400',  label: 'HITL pause' },
              { cls: 'bg-slate-600',  label: 'Idle' },
            ].map(({ cls, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <div className={`w-2 h-2 rounded-full ${cls}`} />
                <span style={{ color: '#94a3b8' }}>{label}</span>
              </div>
            ))}

            <p style={{ color: '#64748b', fontWeight: 600, marginTop: 10, marginBottom: 8 }}>Edges</p>
            {[
              { color: '#4f46e5', label: 'Sequential',   dash: false },
              { color: '#d97706', label: 'Conditional',  dash: true  },
              { color: '#7c3aed', label: 'Return arc',   dash: false },
            ].map(({ color, label, dash }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <svg width={22} height={8}>
                  <line
                    x1="0" y1="4" x2="22" y2="4"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray={dash ? '4 2' : undefined}
                  />
                </svg>
                <span style={{ color: '#94a3b8' }}>{label}</span>
              </div>
            ))}

            <p style={{ color: '#64748b', fontWeight: 600, marginTop: 10, marginBottom: 8 }}>Node roles</p>
            {[
              { color: '#6366f1', label: 'Main / Agent' },
              { color: '#3b82f6', label: 'Sub-agent'    },
              { color: '#d97706', label: 'Supervisor'   },
              { color: '#f97316', label: 'Subordinate'  },
              { color: '#16a34a', label: 'Team member'  },
              { color: '#7c3aed', label: 'Merge'        },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ color: '#94a3b8' }}>{label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}
