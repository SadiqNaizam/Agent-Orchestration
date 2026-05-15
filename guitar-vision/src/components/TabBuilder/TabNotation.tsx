import { motion } from 'framer-motion'
import type { TabMeasure } from '../../types'

const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E']

interface TabNotationProps {
  measures: TabMeasure[]
  title: string
}

export function TabNotation({ measures, title }: TabNotationProps) {
  const buildMeasureLines = (measure: TabMeasure): string[] => {
    const lines = STRING_NAMES.map(() => '|')
    const CELL_WIDTH = 4

    if (measure.notes.length === 0) {
      return STRING_NAMES.map((_, i) => `${STRING_NAMES[i]}|${'-'.repeat(8)}|`)
    }

    for (let si = 0; si < 6; si++) {
      const notesOnString = measure.notes.filter(n => n.string === si)
      let line = ''
      for (const note of notesOnString) {
        const fretStr = note.fret.toString()
        const technique = note.technique === 'hammer-on' ? 'h' : note.technique === 'pull-off' ? 'p' : note.technique === 'bend' ? 'b' : ''
        const cell = fretStr + technique
        line += cell.padEnd(CELL_WIDTH, '-')
      }
      lines[si] = `${STRING_NAMES[si]}|${line || '-'.repeat(CELL_WIDTH)}|`
    }
    return lines
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-black/50 rounded-2xl p-5 border border-white/10 font-mono overflow-x-auto"
    >
      <div className="text-white/40 text-xs mb-3 uppercase tracking-widest">Tab Notation</div>
      <div className="text-chord-detected/80 text-sm mb-3">{title}</div>
      <div className="flex gap-4">
        {measures.map((measure, mi) => (
          <div key={mi} className="flex-shrink-0">
            <div className="text-white/30 text-xs mb-1 text-center">M{mi + 1}</div>
            <pre className="text-white/80 text-sm leading-6">
              {buildMeasureLines(measure).join('\n')}
            </pre>
          </div>
        ))}
      </div>
      <div className="mt-3 text-white/20 text-xs">
        h=hammer-on · p=pull-off · b=bend
      </div>
    </motion.div>
  )
}
