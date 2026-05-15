import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Download, Play, Square, RotateCcw } from 'lucide-react'
import { Fretboard } from '../Fretboard'
import { TabNotation } from './TabNotation'
import type { TabNote, TabMeasure } from '../../types'

const DEFAULT_BPM = 120

export function TabBuilder() {
  const [measures, setMeasures] = useState<TabMeasure[]>([
    { timeSignature: [4, 4], bpm: DEFAULT_BPM, notes: [] },
  ])
  const [activeMeasure, setActiveMeasure] = useState(0)
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [title, setTitle] = useState('My Tab')
  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadNote, setPlayheadNote] = useState<TabNote | null>(null)

  const addNote = useCallback((note: TabNote) => {
    setMeasures(prev => {
      const updated = [...prev]
      updated[activeMeasure] = {
        ...updated[activeMeasure],
        notes: [...updated[activeMeasure].notes, note],
      }
      return updated
    })
  }, [activeMeasure])

  const removeLastNote = useCallback(() => {
    setMeasures(prev => {
      const updated = [...prev]
      const m = updated[activeMeasure]
      if (m.notes.length === 0) return prev
      updated[activeMeasure] = { ...m, notes: m.notes.slice(0, -1) }
      return updated
    })
  }, [activeMeasure])

  const addMeasure = useCallback(() => {
    setMeasures(prev => [...prev, { timeSignature: [4, 4], bpm, notes: [] }])
    setActiveMeasure(prev => prev + 1)
  }, [bpm])

  const clearMeasure = useCallback(() => {
    setMeasures(prev => {
      const updated = [...prev]
      updated[activeMeasure] = { ...updated[activeMeasure], notes: [] }
      return updated
    })
  }, [activeMeasure])

  const playTab = useCallback(async () => {
    const allNotes = measures.flatMap(m => m.notes)
    if (allNotes.length === 0) return
    setIsPlaying(true)
    const beatMs = (60 / bpm) * 1000
    for (const note of allNotes) {
      setPlayheadNote(note)
      await new Promise(res => setTimeout(res, note.duration * beatMs))
    }
    setPlayheadNote(null)
    setIsPlaying(false)
  }, [measures, bpm])

  const exportTab = useCallback(() => {
    const strings = ['e', 'B', 'G', 'D', 'A', 'E']
    let output = `${title}\n${'='.repeat(title.length)}\nTuning: Standard (EADGBe)\nBPM: ${bpm}\n\n`
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i]
      output += `--- Measure ${i + 1} ---\n`
      const lines = strings.map((s, si) => {
        const notesOnString = m.notes.filter(n => n.string === si)
        const cells = notesOnString.map(n => n.fret.toString())
        return `${s}|${cells.join('-') || '-'}|`
      })
      output += lines.join('\n') + '\n\n'
    }
    const blob = new Blob([output], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/\s+/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [measures, bpm, title])

  const activeMeasureNotes = measures[activeMeasure]?.notes ?? []

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="text-2xl font-bold bg-transparent text-white border-b border-white/20 focus:border-chord-detected focus:outline-none pb-1"
          />
          <p className="text-white/40 text-sm mt-1">Click frets to add notes</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-white/60 text-sm">
            BPM
            <input
              type="number" value={bpm} min={40} max={280}
              onChange={e => setBpm(Number(e.target.value))}
              className="w-16 bg-white/5 border border-white/20 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-chord-detected"
            />
          </label>
          <motion.button whileTap={{ scale: 0.95 }} onClick={isPlaying ? () => setIsPlaying(false) : playTab}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm ${isPlaying ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-chord-detected/20 text-chord-detected border border-chord-detected/40'}`}>
            {isPlaying ? <><Square size={14} /> Stop</> : <><Play size={14} /> Play</>}
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={exportTab}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/20 text-white/70 text-sm hover:bg-white/10">
            <Download size={14} /> Export
          </motion.button>
        </div>
      </div>

      {/* Measure tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {measures.map((_, i) => (
          <button key={i} onClick={() => setActiveMeasure(i)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeMeasure === i ? 'bg-chord-detected text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
            Measure {i + 1}
          </button>
        ))}
        <motion.button whileTap={{ scale: 0.95 }} onClick={addMeasure}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 text-white/40 hover:text-white/60 text-sm border border-dashed border-white/20">
          <Plus size={14} /> Add
        </motion.button>
      </div>

      {/* Fretboard */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/60 text-sm">Measure {activeMeasure + 1} — {activeMeasureNotes.length} notes</span>
          <div className="flex gap-2">
            <button onClick={removeLastNote} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-white/5 text-white/40 hover:text-white text-xs">
              <RotateCcw size={12} /> Undo
            </button>
            <button onClick={clearMeasure} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500/10 text-red-400/60 hover:text-red-400 text-xs">
              <Trash2 size={12} /> Clear
            </button>
          </div>
        </div>
        <Fretboard
          highlightedNotes={activeMeasureNotes}
          activeNote={playheadNote}
          onNoteClick={addNote}
          numFrets={15}
        />
      </div>

      {/* ASCII tab notation */}
      <AnimatePresence>
        {measures.some(m => m.notes.length > 0) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <TabNotation measures={measures} title={title} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
