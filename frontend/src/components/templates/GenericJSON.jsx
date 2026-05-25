/**
 * GenericJSON — universal artifact renderer for inline / custom process tools.
 *
 * Renders any JSON object as a collapsible tree. Top-level keys each get their
 * own card. Primitives are colour-coded (string=green, number=amber, bool=blue).
 * Arrays show an item count and can be expanded/collapsed.
 *
 * This template requires no schema contract — any JSON output from an inline
 * tool is renderable here without frontend changes.
 */

import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

// ── Recursive JSON node ───────────────────────────────────────────────────────

function JSONNode({ label, value, depth = 0 }) {
  const isObject  = value !== null && typeof value === 'object'
  const isArray   = Array.isArray(value)
  const isEmpty   = isObject && Object.keys(value).length === 0

  // Auto-expand the first two levels; collapse deeper nodes by default
  const [open, setOpen] = useState(depth < 2)

  if (!isObject) {
    const cls =
      typeof value === 'string'  ? 'text-emerald-400' :
      typeof value === 'number'  ? 'text-amber-400'   :
      typeof value === 'boolean' ? 'text-blue-400'    :
      'text-slate-500'
    const display = typeof value === 'string' ? `"${value}"` : String(value ?? 'null')

    return (
      <div className="flex items-baseline gap-1.5 min-w-0">
        {label !== undefined && (
          <span className="text-slate-400 text-xs font-mono shrink-0">{label}:</span>
        )}
        <span className={`text-xs font-mono break-all ${cls}`}>{display}</span>
      </div>
    )
  }

  const entries    = isArray ? value.map((v, i) => [i, v]) : Object.entries(value)
  const typeLabel  = isArray ? `[ ${entries.length} items ]` : `{ ${entries.length} keys }`

  return (
    <div>
      <button
        onClick={() => !isEmpty && setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-slate-300 hover:text-slate-100 transition-colors w-full text-left"
      >
        {!isEmpty && (open
          ? <ChevronDown  size={10} className="shrink-0 text-slate-500" />
          : <ChevronRight size={10} className="shrink-0 text-slate-500" />
        )}
        {isEmpty && <span className="w-[10px] shrink-0" />}

        {label !== undefined && (
          <span className="text-slate-400 font-mono">{label}:&nbsp;</span>
        )}
        <span className="text-slate-600 font-mono">{typeLabel}</span>
      </button>

      {open && !isEmpty && (
        <div className="pl-4 border-l border-slate-700/40 mt-1 flex flex-col gap-0.5">
          {entries.map(([k, v]) => (
            <JSONNode key={k} label={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function GenericJSON({ data }) {
  if (data == null) return null

  // Flat object → each top-level key gets its own card
  if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data)

    // Special case: if there's a single top-level key that wraps everything,
    // render its children directly instead of nesting one extra level.
    if (entries.length === 1 && typeof entries[0][1] === 'object' && entries[0][1] !== null) {
      const [rootKey, rootVal] = entries[0]
      const children = Array.isArray(rootVal) ? rootVal.map((v, i) => [i, v]) : Object.entries(rootVal)
      return (
        <div className="flex flex-col gap-2 p-3">
          <p className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1">{rootKey}</p>
          {children.map(([k, v]) => (
            <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3">
              <JSONNode label={k} value={v} depth={0} />
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-2 p-3">
        {entries.map(([k, v]) => (
          <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3">
            <JSONNode label={k} value={v} depth={0} />
          </div>
        ))}
      </div>
    )
  }

  // Array or primitive at root
  return (
    <div className="p-3">
      <JSONNode value={data} depth={0} />
    </div>
  )
}
