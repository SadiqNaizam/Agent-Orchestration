const IMPACT_CONFIG = {
  high:   'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low:    'bg-green-500/20 text-green-400 border-green-500/30',
}

const EFFORT_CONFIG = {
  high:   'bg-rose-500/20 text-rose-400 border-rose-500/30',
  medium: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  low:    'bg-teal-500/20 text-teal-400 border-teal-500/30',
}

function ImpactBadge({ level }) {
  const cls = IMPACT_CONFIG[level] || IMPACT_CONFIG.medium
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      Impact: {level || '—'}
    </span>
  )
}

function EffortBadge({ level }) {
  const cls = EFFORT_CONFIG[level] || EFFORT_CONFIG.medium
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      Effort: {level || '—'}
    </span>
  )
}

function HmwCard({ item }) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-slate-600 transition-colors">
      <p className="text-sm font-medium text-slate-200 leading-snug">
        {item.hmw_statement}
      </p>

      {item.solution_directions?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Solution Directions</p>
          <ul className="flex flex-col gap-1">
            {item.solution_directions.map((dir, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400 leading-relaxed">
                <span className="text-indigo-400/70 shrink-0 mt-0.5">→</span>
                {dir}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t border-slate-700/60">
        <ImpactBadge level={item.impact} />
        <EffortBadge level={item.effort} />
      </div>
    </div>
  )
}

function CategorySection({ category, items }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Category header */}
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-200">{category}</h3>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">
          {items.length}
        </span>
        <div className="flex-1 h-px bg-slate-700/60" />
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item, i) => (
          <HmwCard key={i} item={item} />
        ))}
      </div>
    </div>
  )
}

export default function CategorizedCardBoard({ data = [] }) {
  // Handle both flat array and wrapped formats: {categories: [...]}
  const groups = Array.isArray(data) ? data : (data.categories || [])
  const top5   = !Array.isArray(data) ? (data.prioritised_top_5 || []) : []

  if (!groups.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        No HMW statements available.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {top5.length > 0 && (
        <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Top 5 Priorities</p>
          <ol className="flex flex-col gap-1.5">
            {top5.map((stmt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                <span className="text-indigo-400 font-semibold shrink-0 w-4">{i + 1}.</span>
                {stmt}
              </li>
            ))}
          </ol>
        </div>
      )}
      {groups.map((group, i) => (
        <CategorySection
          key={i}
          category={group.category}
          items={group.items || []}
        />
      ))}
    </div>
  )
}
