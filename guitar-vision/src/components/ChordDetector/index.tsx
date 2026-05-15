import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Music } from 'lucide-react'
import { useAudioDetection } from '../../hooks/useAudioDetection'
import { Waveform } from '../UI/Waveform'
import { TunerNeedle } from '../UI/TunerNeedle'
import { ChordDiagram } from '../ChordDiagram'
import { CHORD_LIBRARY } from '../../data/chords'
import { useState, useEffect } from 'react'

export function ChordDetector() {
  const { isListening, currentNote, detectedChord, waveformData, error, startListening, stopListening } = useAudioDetection()
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    if (detectedChord && (history.length === 0 || history[history.length - 1] !== detectedChord)) {
      setHistory(prev => [...prev.slice(-7), detectedChord])
    }
  }, [detectedChord, history])

  const hasChordDiagram = detectedChord ? CHORD_LIBRARY.some(c => c.name === detectedChord) : false

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">Chord Detector</h1>
        <p className="text-white/60 mt-1">Play a chord — I'll identify it in real time</p>
      </div>

      {/* Mic toggle */}
      <div className="flex justify-center">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={isListening ? stopListening : startListening}
          className={`relative flex items-center gap-3 px-8 py-4 rounded-full font-bold text-lg transition-all ${
            isListening
              ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
              : 'bg-chord-detected/20 border-2 border-chord-detected text-chord-detected'
          }`}
        >
          {isListening && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-chord-detected"
              animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
          {isListening ? <MicOff size={22} /> : <Mic size={22} />}
          {isListening ? 'Stop Listening' : 'Start Listening'}
        </motion.button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Waveform */}
      <div className="bg-black/30 rounded-2xl p-4 border border-white/10">
        <Waveform data={waveformData} color={isListening ? '#00FF88' : '#444'} height={80} />
      </div>

      {/* Current note + tuner */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col items-center gap-3">
          <span className="text-white/40 text-sm uppercase tracking-widest">Note</span>
          <AnimatePresence mode="wait">
            {currentNote ? (
              <motion.div
                key={currentNote.note + currentNote.octave}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                className="text-center"
              >
                <div className="text-6xl font-bold text-chord-detected">{currentNote.note}</div>
                <div className="text-white/40 text-sm">{currentNote.frequency.toFixed(1)} Hz · Oct {currentNote.octave}</div>
              </motion.div>
            ) : (
              <motion.div key="empty" className="text-5xl text-white/20">—</motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col items-center gap-2">
          <span className="text-white/40 text-sm uppercase tracking-widest">Tuning</span>
          {currentNote ? (
            <TunerNeedle cents={currentNote.cents} />
          ) : (
            <div className="text-white/20 text-sm mt-4">Play a note</div>
          )}
        </div>
      </div>

      {/* Detected chord */}
      <AnimatePresence>
        {detectedChord && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-chord-detected/5 border-2 border-chord-detected/50 rounded-2xl p-6 flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-2 text-chord-detected">
              <Music size={20} />
              <span className="text-sm uppercase tracking-widest">Detected Chord</span>
            </div>
            <div className="text-7xl font-bold text-chord-detected animate-glow">{detectedChord}</div>
            {hasChordDiagram && (
              <ChordDiagram chordName={detectedChord} highlighted size="lg" animated />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chord history */}
      {history.length > 0 && (
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Chord History</p>
          <div className="flex flex-wrap gap-2">
            {history.map((chord, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`px-3 py-1 rounded-full text-sm font-bold border ${
                  i === history.length - 1
                    ? 'bg-chord-detected/20 border-chord-detected text-chord-detected'
                    : 'bg-white/5 border-white/20 text-white/60'
                }`}
              >
                {chord}
              </motion.span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
