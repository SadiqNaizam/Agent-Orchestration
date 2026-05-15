import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Square, ChevronRight, Star, Clock, Music2 } from 'lucide-react'
import { LEARNING_SONGS } from '../../data/songs'
import { CHORD_LIBRARY } from '../../data/chords'
import { ChordDiagram } from '../ChordDiagram'
import { Fretboard } from '../Fretboard'
import type { LearningSong, TabNote } from '../../types'

const DIFFICULTY_COLORS = {
  beginner: 'text-green-400 bg-green-400/10 border-green-400/30',
  intermediate: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  advanced: 'text-red-400 bg-red-400/10 border-red-400/30',
}

const DIFFICULTY_STARS = { beginner: 1, intermediate: 2, advanced: 3 }

export function LearningMode() {
  const [selectedSong, setSelectedSong] = useState<LearningSong | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentNoteIdx, setCurrentNoteIdx] = useState(0)
  const [currentChordIdx, setCurrentChordIdx] = useState(0)
  const [activeNote, setActiveNote] = useState<TabNote | null>(null)
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const allNotes = selectedSong ? selectedSong.tab.measures.flatMap(m => m.notes) : []

  const startPractice = useCallback(async (song: LearningSong) => {
    setSelectedSong(song)
    setCurrentNoteIdx(0)
    setCurrentChordIdx(0)
    setActiveNote(null)
    setIsPlaying(true)

    const notes = song.tab.measures.flatMap(m => m.notes)
    const beatMs = (60 / song.bpm) * 1000

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]
      setCurrentNoteIdx(i)
      setActiveNote(note)
      await new Promise(res => { rafRef.current = setTimeout(res, note.duration * beatMs) })
    }

    setIsPlaying(false)
    setActiveNote(null)
  }, [])

  const stopPractice = useCallback(() => {
    if (rafRef.current) clearTimeout(rafRef.current)
    setIsPlaying(false)
    setActiveNote(null)
    setCurrentNoteIdx(0)
  }, [])

  if (!selectedSong) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Learn Guitar</h1>
          <p className="text-white/60 mt-1">Choose a song and follow along with animated fret guidance</p>
        </div>

        <div className="grid gap-4">
          {LEARNING_SONGS.map((song, i) => (
            <motion.div
              key={song.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-white/25 transition-all cursor-pointer group"
              onClick={() => setSelectedSong(song)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-bold text-lg">{song.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${DIFFICULTY_COLORS[song.difficulty]}`}>
                      {song.difficulty}
                    </span>
                  </div>
                  <p className="text-white/40 text-sm mb-2">{song.artist}</p>
                  <p className="text-white/60 text-sm">{song.description}</p>

                  {song.chords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {song.chords.map(chord => (
                        <span key={chord} className="px-2 py-0.5 bg-white/5 border border-white/15 rounded-full text-xs text-white/50">
                          {chord}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 text-right">
                  <div className="flex">
                    {Array.from({ length: DIFFICULTY_STARS[song.difficulty] }, (_, i) => (
                      <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />
                    ))}
                    {Array.from({ length: 3 - DIFFICULTY_STARS[song.difficulty] }, (_, i) => (
                      <Star key={i} size={14} className="text-white/20" />
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-white/40 text-xs">
                    <Clock size={12} />
                    {song.bpm} BPM
                  </div>
                  <div className="flex items-center gap-1 text-white/40 text-xs">
                    <Music2 size={12} />
                    {song.tab.measures.length} measures
                  </div>
                  <ChevronRight size={20} className="text-white/20 group-hover:text-chord-detected transition-colors mt-1" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => { stopPractice(); setSelectedSong(null) }}
            className="text-white/40 hover:text-white text-sm mb-1 transition-colors">
            ← Back to songs
          </button>
          <h2 className="text-2xl font-bold text-white">{selectedSong.title}</h2>
          <p className="text-white/40">{selectedSong.artist}</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-white/40 text-sm font-mono">{selectedSong.bpm} BPM</span>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={isPlaying ? stopPractice : () => startPractice(selectedSong)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold ${
              isPlaying
                ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                : 'bg-chord-detected/20 border border-chord-detected/40 text-chord-detected'
            }`}
          >
            {isPlaying ? <><Square size={16} /> Stop</> : <><Play size={16} /> Start Practice</>}
          </motion.button>
        </div>
      </div>

      {/* Progress bar */}
      {isPlaying && allNotes.length > 0 && (
        <div className="bg-white/5 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-full bg-chord-detected"
            animate={{ width: `${((currentNoteIdx + 1) / allNotes.length) * 100}%` }}
            transition={{ type: 'tween' }}
          />
        </div>
      )}

      {/* Interactive fretboard with animated note */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white/40 text-sm uppercase tracking-widest">Fretboard</span>
          {isPlaying && activeNote && (
            <motion.span
              key={currentNoteIdx}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-3 py-0.5 bg-chord-detected/20 border border-chord-detected/50 rounded-full text-chord-detected text-sm font-mono"
            >
              String {activeNote.string + 1} · Fret {activeNote.fret}
            </motion.span>
          )}
        </div>
        <Fretboard
          highlightedNotes={allNotes}
          activeNote={activeNote}
          numFrets={15}
          readonly
        />
      </div>

      {/* Chord progression */}
      {selectedSong.chords.length > 0 && (
        <div>
          <p className="text-white/40 text-sm uppercase tracking-widest mb-4">Chord Progression</p>
          <div className="flex flex-wrap gap-3">
            {selectedSong.chords.map((chordName, i) => {
              const exists = CHORD_LIBRARY.some(c => c.name === chordName)
              return exists ? (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => setCurrentChordIdx(i)}
                >
                  <ChordDiagram
                    chordName={chordName}
                    highlighted={currentChordIdx === i && isPlaying}
                    size="sm"
                    animated
                  />
                </motion.div>
              ) : (
                <div key={i} className="flex items-center justify-center w-20 h-24 bg-white/5 border border-white/10 rounded-xl text-white/40 text-lg font-bold">
                  {chordName}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tips */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-guitar-fret/5 border border-guitar-fret/20 rounded-2xl p-4"
          >
            <p className="text-guitar-fret font-medium mb-2">Practice Tips</p>
            <ul className="text-white/50 text-sm space-y-1">
              <li>• Start at half speed — accuracy before speed</li>
              <li>• Watch the highlighted fret dot, then look at your hand</li>
              <li>• Use a metronome and keep consistent rhythm</li>
              <li>• Practice chord transitions 10× before moving on</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
