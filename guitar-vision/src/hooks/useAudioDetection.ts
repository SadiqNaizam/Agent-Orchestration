import { useCallback, useEffect, useRef, useState } from 'react'
import { audioEngine } from '../lib/audioEngine'
import { analyzeBuffer, detectChordFromNotes } from '../lib/pitchDetection'
import type { DetectedNote, NoteName } from '../types'

const ROLLING_WINDOW = 20

export function useAudioDetection() {
  const [isListening, setIsListening] = useState(false)
  const [currentNote, setCurrentNote] = useState<DetectedNote | null>(null)
  const [detectedChord, setDetectedChord] = useState<string | null>(null)
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rafRef = useRef<number>(0)
  const rollingNotes = useRef<NoteName[]>([])
  const sampleRateRef = useRef(44100)

  const tick = useCallback(() => {
    const buffer = audioEngine.getTimeDomainData()
    if (buffer) {
      setWaveformData(new Float32Array(buffer))
      const note = analyzeBuffer(buffer, sampleRateRef.current)
      if (note) {
        setCurrentNote(note)
        rollingNotes.current = [...rollingNotes.current.slice(-(ROLLING_WINDOW - 1)), note.note]
        const chord = detectChordFromNotes(rollingNotes.current)
        if (chord) setDetectedChord(chord)
      } else {
        setCurrentNote(null)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const startListening = useCallback(async () => {
    setError(null)
    try {
      const { sampleRate } = await audioEngine.start()
      sampleRateRef.current = sampleRate
      rollingNotes.current = []
      setIsListening(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied')
    }
  }, [tick])

  const stopListening = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    audioEngine.stop()
    setIsListening(false)
    setCurrentNote(null)
    setDetectedChord(null)
    setWaveformData(null)
    rollingNotes.current = []
  }, [])

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); audioEngine.stop() }, [])

  return { isListening, currentNote, detectedChord, waveformData, error, startListening, stopListening }
}
