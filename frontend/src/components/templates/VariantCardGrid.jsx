import { CheckCircle } from 'lucide-react'

const APPROACH_CONFIG = {
  safe:     { label: 'Safe',     border: 'border-l-green-500',  badge: 'bg-green-500/20 text-green-400 border-green-500/30' },
  balanced: { label: 'Balanced', border: 'border-l-amber-500',  badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  bold:     { label: 'Bold',     border: 'border-l-violet-500', badge: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
}

function ApproachBadge({ type }) {
  const cfg = APPROACH_CONFIG[type] || APPROACH_CONFIG.balanced
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

function FieldRow({ label, value, valueClass = 'text-slate-300' }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xs leading-relaxed ${valueClass}`}>{value}</p>
    </div>
  )
}

function VariantCard({ card, index, selected, onSelect }) {
  const typeCfg = APPROACH_CONFIG[card.approach_type] || APPROACH_CONFIG.balanced

  return (
    <div
      onClick={() => onSelect(index)}
      className={`
        relative flex flex-col gap-3 p-4 rounded-xl border-l-4 cursor-pointer transition-all
        bg-slate-800/60 border border-slate-700 hover:border-slate-600 hover:bg-slate-800
        ${typeCfg.border}
        ${selected ? 'ring-2 ring-indigo-500 border-slate-600 bg-slate-800' : ''}
      `}
    >
      {selected && (
        <div className="absolute top-3 right-3">
          <CheckCircle size={16} className="text-indigo-400" />
        </div>
      )}

      <div className="flex items-start justify-between gap-2 pr-6">
        <h3 className="text-sm font-semibold text-slate-100 leading-tight">{card.title}</h3>
        <ApproachBadge type={card.approach_type} />
      </div>

      {/* Summary / core statement */}
      {(card.summary || card.core_statement) && (
        <p className="text-xs text-slate-300 leading-relaxed">
          {card.summary || card.core_statement}
        </p>
      )}

      {/* PDF-specific fields: core_user_need / current_gap / success_condition */}
      {card.core_user_need && (
        <FieldRow label="Core User Need" value={card.core_user_need} />
      )}
      {card.current_gap && (
        <FieldRow label="Current Gap" value={card.current_gap} valueClass="text-amber-300/80" />
      )}
      {card.success_condition && (
        <FieldRow label="Success Condition" value={card.success_condition} valueClass="text-green-300/80" />
      )}

      {/* Market analysis variant fields */}
      {card.key_competitors?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Key Competitors</p>
          <div className="flex flex-wrap gap-1.5">
            {card.key_competitors.map((c, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">
                {typeof c === 'string' ? c : c.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {card.market_patterns?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Market Patterns</p>
          <ul className="flex flex-col gap-1">
            {card.market_patterns.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
                <span className="text-blue-400 shrink-0 mt-0.5">→</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Standard fields */}
      {card.rationale && (
        <p className="text-xs text-slate-500 italic leading-relaxed border-t border-slate-700/60 pt-2">
          {card.rationale}
        </p>
      )}

      {card.key_aspects?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Key Aspects</p>
          <ul className="flex flex-col gap-1">
            {card.key_aspects.map((aspect, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
                <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                {aspect}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.key_gaps_to_address?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Gaps to Address</p>
          <ul className="flex flex-col gap-1">
            {card.key_gaps_to_address.map((gap, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300/70">
                <span className="text-amber-400/70 shrink-0 mt-0.5">⚠</span>
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.risks?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Risks</p>
          <ul className="flex flex-col gap-1">
            {card.risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                <span className="text-red-400/70 shrink-0 mt-0.5">⚠</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.recommendation && (
        <div className="border-t border-slate-700/60 pt-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Recommendation</p>
          <p className="text-xs text-green-300/80 leading-relaxed italic">{card.recommendation}</p>
        </div>
      )}
    </div>
  )
}

export default function VariantCardGrid({ data = [], onSelect, selectedIndex }) {
  // Handle both flat array and wrapped formats: {approaches: [...]} or {variants: [...]}
  const cards = Array.isArray(data)
    ? data
    : (data.approaches || data.variants || [])

  // Also surface synthesis text if present
  const synthesis = !Array.isArray(data) ? (data.synthesis || null) : null

  if (!cards.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        No variants available.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {synthesis && (
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Synthesis</p>
          <p className="text-xs text-slate-400 leading-relaxed italic">{synthesis}</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <VariantCard
            key={i}
            card={card}
            index={i}
            selected={selectedIndex === i}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
