// Avatar color palette — deterministic by name
const AVATAR_COLORS = [
  'bg-indigo-600', 'bg-violet-600', 'bg-blue-600', 'bg-teal-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600',
]

function avatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function BulletList({ items }) {
  if (!items?.length) return null
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300 leading-relaxed">
          <span className="text-slate-500 shrink-0 mt-0.5">•</span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function PersonaCard({ persona }) {
  const initial   = (persona.name || '?')[0].toUpperCase()
  const colorCls  = avatarColor(persona.name)

  return (
    <div
      className="flex-none w-72 flex flex-col gap-4 p-4 rounded-xl bg-slate-800/70 border border-slate-700 hover:border-slate-600 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full ${colorCls} flex items-center justify-center shrink-0`}>
          <span className="text-base font-bold text-white">{initial}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 leading-tight truncate">{persona.name}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {persona.archetype && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {persona.archetype}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {persona.age       && <span><span className="text-slate-600">Age:</span> {persona.age}</span>}
        {persona.occupation && <span><span className="text-slate-600">Role:</span> {persona.occupation}</span>}
        {persona.location  && <span><span className="text-slate-600">Loc:</span> {persona.location}</span>}
        {persona.tech_savviness && (
          <span><span className="text-slate-600">Tech:</span> {persona.tech_savviness}</span>
        )}
      </div>

      {/* Scenarios (PDF section 1) */}
      {persona.scenarios?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Scenarios</p>
          <BulletList items={persona.scenarios} />
        </div>
      )}

      {/* Goals (fallback when scenarios not present) */}
      {!persona.scenarios?.length && persona.goals?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Goals</p>
          <BulletList items={persona.goals} />
        </div>
      )}

      {/* Pain Points */}
      {persona.pain_points?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Pain Points</p>
          <ul className="flex flex-col gap-1">
            {persona.pain_points.map((pt, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300 leading-relaxed">
                <span className="text-red-400/70 shrink-0 mt-0.5">✕</span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Motivations (PDF section 3) */}
      {persona.motivations?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Motivations</p>
          <BulletList items={persona.motivations} />
        </div>
      )}

      {/* Expectations (PDF section 4) */}
      {persona.expectations?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Expectations</p>
          <BulletList items={persona.expectations} />
        </div>
      )}

      {/* Behaviour (PDF section 5) */}
      {(persona.behaviour || persona.behaviors)?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Behaviour</p>
          <BulletList items={persona.behaviour || persona.behaviors} />
        </div>
      )}

      {/* EcoSystem (PDF section 6) */}
      {persona.ecosystem?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">EcoSystem</p>
          <BulletList items={persona.ecosystem} />
        </div>
      )}

      {/* Quote */}
      {persona.quote && (
        <div className="border-t border-slate-700/60 pt-3">
          <p className="text-xs text-slate-400 italic leading-relaxed">
            "{persona.quote}"
          </p>
        </div>
      )}
    </div>
  )
}

export default function EntityCardList({ data = [] }) {
  // Handle both flat array and wrapped formats: {personas: [...]}
  const personas = Array.isArray(data) ? data : (data.personas || [])
  const primaryPersona = !Array.isArray(data) ? (data.primary_persona || null) : null
  const designImplications = !Array.isArray(data) ? (data.design_implications || []) : []

  if (!personas.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        No personas available.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {(primaryPersona || designImplications.length > 0) && (
        <div className="flex flex-wrap gap-3 items-start">
          {primaryPersona && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Primary:</span>
              <span className="text-xs text-indigo-300">{primaryPersona}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-3">
        {personas.map((persona, i) => (
          <PersonaCard key={i} persona={persona} />
        ))}
      </div>
      {designImplications.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Design Implications</p>
          <ul className="flex flex-col gap-1">
            {designImplications.map((impl, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400 leading-relaxed">
                <span className="text-indigo-400/70 shrink-0 mt-0.5">→</span>
                {impl}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
