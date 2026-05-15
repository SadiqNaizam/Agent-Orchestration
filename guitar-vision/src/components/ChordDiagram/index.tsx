import { motion } from 'framer-motion'
import type { ChordVoicing } from '../../types'
import { CHORD_LIBRARY } from '../../data/chords'

interface ChordDiagramProps {
  chordName: string
  highlighted?: boolean
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
}

const SIZE_MAP = {
  sm: { width: 100, fretHeight: 16, stringSpacing: 14, dotR: 5, startX: 16, startY: 28, fontSize: 9 },
  md: { width: 130, fretHeight: 20, stringSpacing: 18, dotR: 7, startX: 20, startY: 35, fontSize: 11 },
  lg: { width: 180, fretHeight: 26, stringSpacing: 24, dotR: 9, startX: 28, startY: 48, fontSize: 14 },
}

export function ChordDiagram({ chordName, highlighted = false, size = 'md', animated = true }: ChordDiagramProps) {
  const chord = CHORD_LIBRARY.find(c => c.name === chordName)
  const voicing: ChordVoicing | null = chord?.voicings[0] ?? null
  const { width, fretHeight, stringSpacing, dotR, startX, startY, fontSize } = SIZE_MAP[size]

  const numFrets = 5
  const totalHeight = startY + numFrets * fretHeight + 20
  const strings = 6
  const totalWidth = startX + (strings - 1) * stringSpacing + 20

  const minFret = voicing ? Math.max(1, Math.min(...voicing.frets.filter(f => f > 0))) : 1
  const showBarreCapo = minFret > 1

  return (
    <motion.div
      initial={animated ? { opacity: 0, scale: 0.8 } : {}}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      className={`inline-flex flex-col items-center gap-1 p-3 rounded-xl border transition-all cursor-pointer ${
        highlighted
          ? 'bg-chord-detected/10 border-chord-detected shadow-lg shadow-chord-detected/30 animate-glow'
          : 'bg-white/5 border-white/10 hover:border-white/30'
      }`}
    >
      <span className={`font-bold ${highlighted ? 'text-chord-detected' : 'text-white'}`} style={{ fontSize: fontSize + 4 }}>
        {chordName}
      </span>

      <svg width={totalWidth} height={totalHeight} className="overflow-visible">
        {/* Nut or position marker */}
        {!showBarreCapo ? (
          <rect x={startX} y={startY - 3} width={(strings - 1) * stringSpacing} height={3} fill="white" rx={1} />
        ) : (
          <text x={startX - 8} y={startY + fretHeight / 2 + 4} fill="#C0A060" fontSize={fontSize} textAnchor="end">
            {minFret}
          </text>
        )}

        {/* Fret lines */}
        {Array.from({ length: numFrets + 1 }, (_, i) => (
          <line
            key={i}
            x1={startX} y1={startY + i * fretHeight}
            x2={startX + (strings - 1) * stringSpacing} y2={startY + i * fretHeight}
            stroke="rgba(255,255,255,0.2)" strokeWidth={1}
          />
        ))}

        {/* String lines */}
        {Array.from({ length: strings }, (_, i) => (
          <line
            key={i}
            x1={startX + i * stringSpacing} y1={startY}
            x2={startX + i * stringSpacing} y2={startY + numFrets * fretHeight}
            stroke="rgba(212,175,55,0.5)" strokeWidth={i === 0 || i === 5 ? 2 : 1}
          />
        ))}

        {/* Barre */}
        {voicing?.barre && (
          <rect
            x={startX + voicing.barre.fromString * stringSpacing - dotR}
            y={startY + (voicing.barre.fret - minFret) * fretHeight + fretHeight / 2 - dotR}
            width={(voicing.barre.toString - voicing.barre.fromString) * stringSpacing + dotR * 2}
            height={dotR * 2}
            rx={dotR}
            fill={highlighted ? '#00FF88' : '#FF6B35'}
            opacity={0.9}
          />
        )}

        {/* Finger dots */}
        {voicing && voicing.frets.map((fret, stringIdx) => {
          const x = startX + stringIdx * stringSpacing
          if (fret === -1) {
            return (
              <text key={stringIdx} x={x} y={startY - 8} fill="rgba(255,100,100,0.8)" fontSize={fontSize} textAnchor="middle">
                ✕
              </text>
            )
          }
          if (fret === 0) {
            return (
              <circle key={stringIdx} cx={x} cy={startY - 8} r={dotR - 2} fill="none"
                stroke={highlighted ? '#00FF88' : 'rgba(255,255,255,0.6)'} strokeWidth={1.5} />
            )
          }
          const displayFret = fret - minFret + 1
          if (displayFret < 1 || displayFret > numFrets) return null
          const y = startY + (displayFret - 0.5) * fretHeight
          return (
            <motion.circle
              key={stringIdx}
              cx={x} cy={y} r={dotR}
              fill={highlighted ? '#00FF88' : '#FF6B35'}
              initial={animated ? { scale: 0 } : {}}
              animate={{ scale: 1 }}
              transition={{ delay: stringIdx * 0.05 }}
            />
          )
        })}

        {/* Finger numbers */}
        {voicing && voicing.fingers.map((finger, stringIdx) => {
          const fret = voicing.frets[stringIdx]
          if (fret <= 0 || finger === 0) return null
          const displayFret = fret - minFret + 1
          if (displayFret < 1 || displayFret > numFrets) return null
          const x = startX + stringIdx * stringSpacing
          const y = startY + (displayFret - 0.5) * fretHeight
          return (
            <text key={stringIdx} x={x} y={y + fontSize / 3} fill="white" fontSize={fontSize - 1} textAnchor="middle" fontWeight="bold">
              {finger}
            </text>
          )
        })}
      </svg>
    </motion.div>
  )
}
