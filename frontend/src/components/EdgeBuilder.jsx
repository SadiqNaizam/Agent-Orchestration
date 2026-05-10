import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, GitBranch } from 'lucide-react'

function blankEdge(nodes) {
  const from = nodes.length ? nodes[0] : '__start__'
  const to   = nodes.length > 1 ? nodes[1] : '__end__'
  return {
    edge_id:   `e-${Date.now()}`,
    from:      from,
    to:        to,
    condition: null,
    default:   false,
    loop:      null,
  }
}

// ── Edge card ──────────────────────────────────────────────────────────────────
function EdgeCard({ edge, onChange, onDelete, nodeIds }) {
  const [open, setOpen] = useState(false)

  const cls  = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"
  const fromOptions = ['__start__', ...nodeIds]
  const toOptions   = [...nodeIds, '__end__']

  const setCondType = (t) => {
    if (t === 'none') {
      onChange({ ...edge, condition: null })
    } else {
      onChange({
        ...edge,
        condition: { type: t, expression: '' },
      })
    }
  }

  const hasCondition = edge.condition !== null
  const hasLoop      = edge.loop !== null

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden mb-2">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch size={13} className="text-violet-400 shrink-0" />
          <span className="text-xs font-mono text-slate-300 truncate">
            {edge.from || '?'} → {edge.to || '?'}
          </span>
          {edge.condition && (
            <span className="text-xs px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 shrink-0">
              condition
            </span>
          )}
          {edge.loop && (
            <span className="text-xs px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
              loop
            </span>
          )}
          {edge.default && (
            <span className="text-xs px-1 py-0.5 rounded bg-slate-600 text-slate-400 shrink-0">
              default
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
          {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3 bg-slate-900/50">

          {/* Edge ID */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Edge ID</label>
            <input className={cls} value={edge.edge_id}
              onChange={e => onChange({ ...edge, edge_id: e.target.value })}
              placeholder="e1" />
          </div>

          {/* From / To */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">From *</label>
              <select className={cls} value={edge.from}
                onChange={e => onChange({ ...edge, from: e.target.value })}>
                {fromOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">To *</label>
              <select className={cls} value={edge.to}
                onChange={e => onChange({ ...edge, to: e.target.value })}>
                {toOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Condition */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400">Condition</label>
            <select
              className={cls}
              value={edge.condition ? edge.condition.type : 'none'}
              onChange={e => setCondType(e.target.value)}
            >
              <option value="none">none (unconditional)</option>
              <option value="deterministic">deterministic (JSONPath expression)</option>
            </select>

            {edge.condition?.type === 'deterministic' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Expression</label>
                <input
                  className={`${cls} font-mono`}
                  value={edge.condition.expression || ''}
                  onChange={e => onChange({
                    ...edge,
                    condition: { ...edge.condition, expression: e.target.value },
                  })}
                  placeholder="$.node_id.output.approved == true"
                />
                <p className="text-xs text-slate-600">
                  JSONPath boolean expression evaluated against the blackboard.
                </p>
              </div>
            )}
          </div>

          {/* Default flag */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={edge.default}
              onChange={e => onChange({ ...edge, default: e.target.checked })}
              className="accent-indigo-500"
            />
            <span className="text-xs text-slate-400">
              Default edge (fallback when no condition matches)
            </span>
          </label>

          {/* Loop */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasLoop}
              onChange={e => onChange({
                ...edge,
                loop: e.target.checked
                  ? { loop_id: `loop-${Date.now()}`, max_iterations: 5, exit_condition: '' }
                  : null,
              })}
              className="accent-amber-500"
            />
            <span className="text-xs text-slate-400">Loop construct (back-edge)</span>
          </label>

          {hasLoop && (
            <div className="flex flex-col gap-2 pl-2 border-l border-amber-500/30">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Loop ID</label>
                  <input className={cls} value={edge.loop.loop_id}
                    onChange={e => onChange({ ...edge, loop: { ...edge.loop, loop_id: e.target.value } })}
                    placeholder="revision_loop" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Max Iterations</label>
                  <input type="number" min="1" max="50" className={cls}
                    value={edge.loop.max_iterations}
                    onChange={e => onChange({ ...edge, loop: { ...edge.loop, max_iterations: parseInt(e.target.value) } })} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Exit Condition</label>
                <input className={`${cls} font-mono`}
                  value={edge.loop.exit_condition}
                  onChange={e => onChange({ ...edge, loop: { ...edge.loop, exit_condition: e.target.value } })}
                  placeholder="$.reviewer.output.approved == true" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function EdgeBuilder({ edges, setEdges, nodeIds }) {
  const add    = ()          => setEdges(prev => [...prev, blankEdge(nodeIds)])
  const remove = (idx)       => setEdges(prev => prev.filter((_, i) => i !== idx))
  const update = (idx, edge) => setEdges(prev => prev.map((e, i) => i === idx ? edge : e))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Edges <span className="text-slate-500 font-normal">({edges.length})</span>
        </h2>
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-violet-600/20 text-violet-400 border border-violet-600/30 hover:bg-violet-600/30 transition-colors"
        >
          <Plus size={12} /> Add Edge
        </button>
      </div>

      <div className="mb-4 p-2.5 rounded bg-slate-800/60 border border-slate-700 text-xs text-slate-500 leading-relaxed">
        <span className="text-slate-400 font-medium">Flow: </span>
        {edges.length === 0 ? 'No edges — add edges to define the execution order.' : (
          edges.map((e, i) => (
            <span key={i}>
              <span className="font-mono text-slate-300">{e.from}</span>
              <span className="text-slate-600"> → </span>
              <span className="font-mono text-slate-300">{e.to}</span>
              {i < edges.length - 1 && <span className="text-slate-700 mx-1">·</span>}
            </span>
          ))
        )}
      </div>

      {edges.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-xs border border-dashed border-slate-700 rounded-lg">
          No edges yet.<br />
          Add edges to connect nodes. Every flow needs at least<br />
          one edge from <code className="text-slate-400">__start__</code> and one to <code className="text-slate-400">__end__</code>.
        </div>
      )}

      {edges.map((edge, i) => (
        <EdgeCard
          key={i}
          edge={edge}
          onChange={(e) => update(i, e)}
          onDelete={() => remove(i)}
          nodeIds={nodeIds}
        />
      ))}
    </div>
  )
}
