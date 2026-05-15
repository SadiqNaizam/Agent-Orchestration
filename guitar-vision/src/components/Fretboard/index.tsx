import { motion, AnimatePresence } from 'framer-motion'
import type { TabNote } from '../../types'

interface FretboardProps {
  highlightedNotes?: TabNote[]
  activeNote?: TabNote | null
  onNoteClick?: (note: TabNote) => void
  numFrets?: number
  readonly?: boolean
}

const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e']
const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17]
const DOUBLE_MARKERS = [12]

export function Fretboard({
  highlightedNotes = [],
  activeNote = null,
  onNoteClick,
  numFrets = 12,
  readonly = false,
}: FretboardProps) {
  const isHighlighted = (string: number, fret: number) =>
    highlightedNotes.some(n => n.string === string && n.fret === fret)

  const isActive = (string: number, fret: number) =>
    activeNote?.string === string && activeNote?.fret === fret

  const getTechniqueLabel = (string: number, fret: number) => {
    const note = highlightedNotes.find(n => n.string === string && n.fret === fret)
    if (!note?.technique || note.technique === 'normal') return null
    const labels: Record<string, string> = {
      'hammer-on': 'H', 'pull-off': 'P', 'bend': 'B',
      'slide-up': '↑', 'slide-down': '↓', 'vibrato': '~',
    }
    return labels[note.technique] ?? null
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-guitar-neck border border-guitar-wood/50 p-4">
      <div className="relative" style={{ minWidth: numFrets * 52 + 60 }}>
        {/* Fret markers */}
        <div className="flex mb-2">
          <div className="w-14" />
          {Array.from({ length: numFrets + 1 }, (_, fret) => (
            <div key={fret} className="flex-1 text-center">
              {FRET_MARKERS.includes(fret) && (
                <div className="flex justify-center gap-0.5">
                  <div className={`w-2 h-2 rounded-full bg-white/20 ${DOUBLE_MARKERS.includes(fret) ? '' : ''}`} />
                  {DOUBLE_MARKERS.includes(fret) && <div className="w-2 h-2 rounded-full bg-white/20" />}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Strings */}
        {Array.from({ length: 6 }, (_, stringIdx) => {
          const stringThickness = stringIdx === 0 ? 3 : stringIdx === 1 ? 2.5 : stringIdx === 2 ? 2 : 1.5
          return (
            <div key={stringIdx} className="flex items-center mb-1">
              {/* String label */}
              <div className="w-14 text-right pr-3 text-guitar-fret text-sm font-mono font-bold">
                {STRING_NAMES[stringIdx]}
              </div>

              {/* Frets */}
              {Array.from({ length: numFrets + 1 }, (_, fretIdx) => {
                const highlighted = isHighlighted(stringIdx, fretIdx)
                const active = isActive(stringIdx, fretIdx)
                return (
                  <div
                    key={fretIdx}
                    className="relative flex-1 flex items-center justify-center"
                    style={{ height: 36 }}
                  >
                    {/* String line */}
                    <div
                      className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-guitar-string/60"
                      style={{ height: stringThickness }}
                    />

                    {/* Fret bar */}
                    {fretIdx > 0 && (
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-guitar-fret/40" />
                    )}

                    {/* Nut */}
                    {fretIdx === 0 && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/40 rounded-sm" />
                    )}

                    {/* Note dot */}
                    <AnimatePresence>
                      {(highlighted || active) && (
                        <motion.button
                          initial={{ scale: 0 }}
                          animate={{ scale: active ? 1.3 : 1 }}
                          exit={{ scale: 0 }}
                          className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                            active
                              ? 'bg-chord-detected text-black shadow-lg shadow-chord-detected/50'
                              : 'bg-chord-root text-white'
                          } ${!readonly ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
                          onClick={() => !readonly && onNoteClick?.({ string: stringIdx, fret: fretIdx, duration: 1 })}
                        >
                          {getTechniqueLabel(stringIdx, fretIdx) ?? fretIdx}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* Clickable area for adding notes */}
                    {!highlighted && !active && !readonly && (
                      <button
                        className="relative z-10 w-7 h-7 rounded-full opacity-0 hover:opacity-30 bg-white transition-opacity"
                        onClick={() => onNoteClick?.({ string: stringIdx, fret: fretIdx, duration: 1 })}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Fret numbers */}
        <div className="flex mt-2">
          <div className="w-14" />
          {Array.from({ length: numFrets + 1 }, (_, fret) => (
            <div key={fret} className="flex-1 text-center text-guitar-fret/60 text-xs font-mono">
              {fret > 0 ? fret : '0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
