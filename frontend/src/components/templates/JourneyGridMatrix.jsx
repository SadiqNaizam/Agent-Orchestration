const EMOTION_EMOJI = { 1: '😩', 2: '😟', 3: '😐', 4: '😊', 5: '😄' }

const ROW_LABELS = [
  { key: 'actions',      label: 'Actions'     },
  { key: 'thoughts',     label: 'Thoughts'    },
  { key: 'emotions',     label: 'Emotions'    },
  { key: 'pain_points',  label: 'Pain Points' },
  { key: 'opportunities',label: 'Opportunities' },
]

const LABEL_COL_WIDTH = 'w-24 min-w-24'

function CellList({ items, className = '' }) {
  if (!items?.length) return <span className="text-slate-700 text-xs italic">—</span>
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => (
        <li key={i} className={`text-xs leading-relaxed ${className}`}>{item}</li>
      ))}
    </ul>
  )
}

function EmotionCell({ emotion }) {
  if (!emotion) return <span className="text-slate-700 text-xs italic">—</span>
  const intensity = Math.min(5, Math.max(1, Math.round(emotion.intensity || 3)))
  const emoji     = EMOTION_EMOJI[intensity]
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl leading-none">{emoji}</span>
      {emotion.label && (
        <span className="text-xs text-slate-400 text-center leading-tight">{emotion.label}</span>
      )}
      <div className="flex gap-0.5 mt-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <div
            key={n}
            className={`w-1.5 h-1.5 rounded-full ${
              n <= intensity ? 'bg-indigo-400' : 'bg-slate-700'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function StageCell({ stage, rowKey }) {
  const isPainRow = rowKey === 'pain_points'
  const isOppRow  = rowKey === 'opportunities'

  const cellBg = isPainRow
    ? 'bg-red-950/30'
    : isOppRow
      ? 'bg-green-950/30'
      : ''

  return (
    <td className={`align-top px-3 py-3 border border-slate-700/50 min-w-40 ${cellBg}`}>
      {rowKey === 'actions' && (
        <CellList items={stage.actions} className="text-slate-300" />
      )}
      {rowKey === 'thoughts' && (
        <CellList items={stage.thoughts} className="text-slate-400 italic" />
      )}
      {rowKey === 'emotions' && (
        <EmotionCell emotion={stage.emotions} />
      )}
      {rowKey === 'pain_points' && (
        <CellList items={stage.pain_points} className="text-red-300/80" />
      )}
      {rowKey === 'opportunities' && (
        <CellList items={stage.opportunities} className="text-green-300/80" />
      )}
    </td>
  )
}

export default function JourneyGridMatrix({ data = {}, onSelect, selectedIndex }) {
  const { persona_name, stages = [] } = data

  if (!stages.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        No journey stages available.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {persona_name && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Journey Map for</span>
          <span className="text-sm font-semibold text-slate-200">{persona_name}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800">
              {/* Sticky label column header */}
              <th className={`${LABEL_COL_WIDTH} sticky left-0 z-10 bg-slate-800 border border-slate-700/50 px-3 py-2.5 text-left`}>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage</span>
              </th>
              {stages.map((stage, i) => (
                <th
                  key={i}
                  onClick={() => onSelect?.(i, stage.name || `Stage ${i + 1}`)}
                  className={`px-3 py-2.5 text-center border border-slate-700/50 bg-slate-800 min-w-40 cursor-pointer hover:bg-slate-700/60 transition-colors
                    ${selectedIndex === i ? 'bg-indigo-500/10 border-indigo-500/40' : ''}
                  `}
                >
                  <span className={`text-xs font-semibold ${selectedIndex === i ? 'text-indigo-300' : 'text-slate-200'}`}>
                    {stage.name || `Stage ${i + 1}`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_LABELS.map(({ key, label }) => (
              <tr key={key} className="group">
                {/* Sticky row label */}
                <td
                  className={`${LABEL_COL_WIDTH} sticky left-0 z-10 bg-slate-900 border border-slate-700/50 px-3 py-3 align-middle`}
                >
                  <span className={`text-xs font-semibold uppercase tracking-wider ${
                    key === 'pain_points'   ? 'text-red-400/80'   :
                    key === 'opportunities' ? 'text-green-400/80' :
                    'text-slate-500'
                  }`}>
                    {label}
                  </span>
                </td>
                {stages.map((stage, i) => (
                  <StageCell key={i} stage={stage} rowKey={key} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
