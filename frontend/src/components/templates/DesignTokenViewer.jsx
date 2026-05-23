import { useState } from 'react'

const PRIORITY_CONFIG = {
  high:   'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low:    'bg-green-500/20 text-green-400 border-green-500/30',
}

const TABS = [
  { id: 'colors',     label: 'Colors'     },
  { id: 'typography', label: 'Typography' },
  { id: 'spacing',    label: 'Spacing'    },
  { id: 'components', label: 'Components' },
  { id: 'gaps',       label: 'Gaps'       },
]

// ── Colors ────────────────────────────────────────────────────────────────────

function ColorSwatch({ token }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="w-full h-14 rounded-lg border border-slate-700/60 shadow-inner"
        style={{ backgroundColor: token.hex }}
      />
      <div>
        <p className="text-xs font-medium text-slate-300 truncate">{token.name}</p>
        <p className="text-xs text-slate-500 font-mono">{token.hex}</p>
        {token.usage && (
          <p className="text-xs text-slate-600 leading-snug mt-0.5">{token.usage}</p>
        )}
      </div>
    </div>
  )
}

function ColorsTab({ colors = [] }) {
  if (!colors.length) return <EmptyState />
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {colors.map((token, i) => <ColorSwatch key={i} token={token} />)}
    </div>
  )
}

// ── Typography ────────────────────────────────────────────────────────────────

function TypographyTab({ typography = [] }) {
  if (!typography.length) return <EmptyState />
  return (
    <div className="flex flex-col gap-4">
      {typography.map((token, i) => (
        <div key={i} className="flex items-baseline gap-6 py-4 border-b border-slate-800 last:border-0">
          <div className="w-36 shrink-0">
            <p className="text-xs font-semibold text-slate-400">{token.name}</p>
            <p className="text-xs text-slate-600 font-mono mt-0.5">
              {token.size}{token.weight ? ` / ${token.weight}` : ''}{token.line_height ? ` / lh${token.line_height}` : ''}
            </p>
            {token.usage && (
              <p className="text-xs text-slate-700 mt-0.5 leading-snug">{token.usage}</p>
            )}
          </div>
          <p
            className="text-slate-200 leading-snug flex-1 min-w-0 truncate"
            style={{
              fontSize:    token.size   || undefined,
              fontWeight:  token.weight || undefined,
              lineHeight:  token.line_height || undefined,
            }}
          >
            The quick brown fox jumps over the lazy dog
          </p>
        </div>
      ))}
    </div>
  )
}

// ── Spacing ───────────────────────────────────────────────────────────────────

function SpacingTab({ spacing = [] }) {
  if (!spacing.length) return <EmptyState />

  const maxPx = Math.max(...spacing.map(t => parseFloat(t.px) || 0), 1)

  return (
    <div className="flex flex-col gap-3">
      {spacing.map((token, i) => {
        const px      = parseFloat(token.px) || 0
        const barPct  = Math.min(100, (px / maxPx) * 100)
        return (
          <div key={i} className="flex items-center gap-4">
            <div className="w-20 shrink-0 text-right">
              <p className="text-xs font-medium text-slate-400">{token.name}</p>
              <p className="text-xs text-slate-600 font-mono">{token.value}</p>
            </div>
            <div className="flex-1 flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500/70 rounded-full"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 font-mono w-12 text-right shrink-0">{token.px}px</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Components ────────────────────────────────────────────────────────────────

function ComponentsTab({ components = [] }) {
  if (!components.length) return <EmptyState />
  return (
    <div className="flex flex-col gap-4">
      {components.map((comp, i) => (
        <div key={i} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <div className="flex items-start justify-between gap-4 mb-2">
            <p className="text-sm font-semibold text-slate-200">{comp.name}</p>
          </div>
          {comp.description && (
            <p className="text-xs text-slate-400 leading-relaxed mb-3">{comp.description}</p>
          )}
          {comp.variants?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {comp.variants.map((v, j) => (
                <span
                  key={j}
                  className="text-xs px-2 py-1 rounded bg-slate-700/60 text-slate-400 border border-slate-700"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Gaps ──────────────────────────────────────────────────────────────────────

function GapsTab({ gap_analysis = [] }) {
  if (!gap_analysis.length) return <EmptyState />
  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-800">
          <tr>
            {['Area', 'Current', 'Needed', 'Priority'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gap_analysis.map((gap, i) => (
            <tr
              key={i}
              className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${
                i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/20'
              }`}
            >
              <td className="px-4 py-3 text-xs font-medium text-slate-300">{gap.area}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{gap.current}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{gap.needed}</td>
              <td className="px-4 py-3">
                {gap.priority && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                    PRIORITY_CONFIG[gap.priority?.toLowerCase()] || PRIORITY_CONFIG.medium
                  }`}>
                    {gap.priority}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
      No data for this section.
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function DesignTokenViewer({ data = {} }) {
  const [activeTab, setActiveTab] = useState('colors')

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-slate-700 gap-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 shrink-0 ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-32">
        {activeTab === 'colors'     && <ColorsTab     colors={data.colors} />}
        {activeTab === 'typography' && <TypographyTab typography={data.typography} />}
        {activeTab === 'spacing'    && <SpacingTab    spacing={data.spacing} />}
        {activeTab === 'components' && <ComponentsTab components={data.components} />}
        {activeTab === 'gaps'       && <GapsTab       gap_analysis={data.gap_analysis} />}
      </div>
    </div>
  )
}
