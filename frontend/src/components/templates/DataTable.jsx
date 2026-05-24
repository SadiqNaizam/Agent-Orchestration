// Fixed badge color palette — deterministic hash
const BADGE_PALETTE = [
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'bg-blue-500/20   text-blue-300   border-blue-500/30',
  'bg-teal-500/20   text-teal-300   border-teal-500/30',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'bg-amber-500/20  text-amber-300  border-amber-500/30',
  'bg-rose-500/20   text-rose-300   border-rose-500/30',
  'bg-cyan-500/20   text-cyan-300   border-cyan-500/30',
]

const PRIORITY_CONFIG = {
  high:   'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low:    'bg-teal-500/20 text-teal-400 border-teal-500/30',
}

const AVATAR_COLORS = [
  'bg-indigo-600', 'bg-violet-600', 'bg-blue-600', 'bg-teal-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600',
]

function strHash(str = '') {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff
  return h
}

function BadgeChip({ value }) {
  const cls = BADGE_PALETTE[strHash(value) % BADGE_PALETTE.length]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {value}
    </span>
  )
}

function PriorityBadge({ value }) {
  const cls = PRIORITY_CONFIG[value?.toLowerCase()] || PRIORITY_CONFIG.medium
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {value}
    </span>
  )
}

function PersonaCell({ value }) {
  const initial  = (value || '?')[0].toUpperCase()
  const colorCls = AVATAR_COLORS[strHash(value) % AVATAR_COLORS.length]
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full ${colorCls} flex items-center justify-center shrink-0`}>
        <span className="text-xs font-bold text-white">{initial}</span>
      </div>
      <span className="text-xs text-slate-300">{value}</span>
    </div>
  )
}

function CellContent({ type, value }) {
  if (value == null || value === '') return <span className="text-slate-700 text-xs">—</span>

  switch (type) {
    case 'badge':
      return <BadgeChip value={String(value)} />

    case 'list': {
      const items = Array.isArray(value) ? value : String(value).split(',').map(s => s.trim())
      return (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => <BadgeChip key={i} value={item} />)}
        </div>
      )
    }

    case 'priority':
      return <PriorityBadge value={String(value)} />

    case 'persona':
      return <PersonaCell value={String(value)} />

    case 'text':
    default:
      return <span className="text-xs text-slate-300 leading-relaxed">{String(value)}</span>
  }
}

export default function DataTable({ data = {}, onSelect, selectedIndex }) {
  const { columns = [], rows = [] } = data

  if (!columns.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        No table data available.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800">
              {columns.map(col => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap"
                >
                  {col.label || col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-slate-600">
                  No rows to display.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  onClick={() => onSelect?.(rowIdx, String(row[columns[0]?.key] ?? `Row ${rowIdx + 1}`))}
                  className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors cursor-pointer ${
                    selectedIndex === rowIdx
                      ? 'bg-indigo-500/10 border-indigo-500/20'
                      : rowIdx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/20'
                  }`}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 align-top">
                      <CellContent type={col.type} value={row[col.key]} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
