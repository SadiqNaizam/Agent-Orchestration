import type { DetectedNote, NoteName } from '../types'
import { ALL_NOTES } from '../data/chords'

/**
 * YIN algorithm for pitch detection — avoids octave errors better than autocorrelation alone.
 * Returns fundamental frequency in Hz, or -1 if no pitch found.
 */
export function detectPitchYIN(buffer: Float32Array, sampleRate: number): number {
  const bufferSize = buffer.length
  const halfBuffer = Math.floor(bufferSize / 2)
  const yinBuffer = new Float32Array(halfBuffer)
  let probability = 0
  let tau = -1

  // Step 1: Difference function
  for (let t = 0; t < halfBuffer; t++) {
    yinBuffer[t] = 0
    for (let j = 0; j < halfBuffer; j++) {
      const delta = buffer[j] - buffer[j + t]
      yinBuffer[t] += delta * delta
    }
  }

  // Step 2: Cumulative mean normalized difference
  yinBuffer[0] = 1
  let runningSum = 0
  for (let t = 1; t < halfBuffer; t++) {
    runningSum += yinBuffer[t]
    yinBuffer[t] = yinBuffer[t] * t / runningSum
  }

  // Step 3: Absolute threshold
  const threshold = 0.10
  for (let t = 2; t < halfBuffer; t++) {
    if (yinBuffer[t] < threshold) {
      while (t + 1 < halfBuffer && yinBuffer[t + 1] < yinBuffer[t]) t++
      probability = 1 - yinBuffer[t]
      tau = t
      break
    }
  }

  if (tau < 0) return -1

  // Step 4: Parabolic interpolation for better accuracy
  const betterTau =
    tau !== halfBuffer - 1
      ? tau + (yinBuffer[tau + 1] - yinBuffer[tau - 1]) / (2 * (2 * yinBuffer[tau] - yinBuffer[tau - 1] - yinBuffer[tau + 1]))
      : tau

  return probability > 0.9 ? sampleRate / betterTau : -1
}

/** Convert Hz frequency to note name + octave + cents deviation. */
export function frequencyToNote(frequency: number): { note: NoteName; octave: number; cents: number } | null {
  if (frequency <= 0) return null

  const A4 = 440
  const semitonesFromA4 = 12 * Math.log2(frequency / A4)
  const roundedSemitones = Math.round(semitonesFromA4)
  const noteIndex = ((roundedSemitones % 12) + 12 + 9) % 12  // offset: A=9
  const octave = Math.floor((roundedSemitones + 9) / 12) + 4
  const cents = Math.round((semitonesFromA4 - roundedSemitones) * 100)

  return {
    note: ALL_NOTES[noteIndex] as NoteName,
    octave,
    cents,
  }
}

/** Full pipeline: buffer → DetectedNote or null */
export function analyzeBuffer(
  buffer: Float32Array,
  sampleRate: number,
): DetectedNote | null {
  // Compute RMS to gate silent frames
  let rms = 0
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.01) return null

  const frequency = detectPitchYIN(buffer, sampleRate)
  if (frequency < 60 || frequency > 1400) return null

  const noteInfo = frequencyToNote(frequency)
  if (!noteInfo) return null

  return {
    frequency,
    note: noteInfo.note,
    octave: noteInfo.octave,
    cents: noteInfo.cents,
    confidence: Math.min(1, rms * 10),
  }
}

/** Rolling buffer of recent notes → most likely chord */
export function detectChordFromNotes(recentNotes: NoteName[]): string | null {
  if (recentNotes.length < 3) return null

  // Count frequency of each note in the rolling window
  const noteCounts = new Map<NoteName, number>()
  for (const note of recentNotes) {
    noteCounts.set(note, (noteCounts.get(note) ?? 0) + 1)
  }

  // Keep notes that appear in more than 20% of frames
  const threshold = recentNotes.length * 0.2
  const activeNotes = [...noteCounts.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([note]) => note)

  if (activeNotes.length < 2) return null
  return matchNotesToChord(activeNotes)
}

const CHORD_INTERVALS: Record<string, number[]> = {
  major:    [0, 4, 7],
  minor:    [0, 3, 7],
  dominant7: [0, 4, 7, 10],
  major7:   [0, 4, 7, 11],
  minor7:   [0, 3, 7, 10],
  sus2:     [0, 2, 7],
  sus4:     [0, 5, 7],
  dim:      [0, 3, 6],
  aug:      [0, 4, 8],
}

const QUALITY_DISPLAY: Record<string, string> = {
  major: '',
  minor: 'm',
  dominant7: '7',
  major7: 'maj7',
  minor7: 'm7',
  sus2: 'sus2',
  sus4: 'sus4',
  dim: 'dim',
  aug: 'aug',
}

function matchNotesToChord(notes: NoteName[]): string | null {
  const noteIndices = notes.map(n => ALL_NOTES.indexOf(n as typeof ALL_NOTES[number]))

  let bestMatch = ''
  let bestScore = 0

  for (const root of ALL_NOTES) {
    const rootIdx = ALL_NOTES.indexOf(root)

    for (const [quality, intervals] of Object.entries(CHORD_INTERVALS)) {
      const chordNotes = intervals.map(i => (rootIdx + i) % 12)
      let score = 0
      for (const ni of noteIndices) {
        if (chordNotes.includes(ni)) score++
      }
      const coverage = score / intervals.length
      const precision = score / noteIndices.length

      const combined = (coverage + precision) / 2
      if (combined > bestScore && combined > 0.5) {
        bestScore = combined
        bestMatch = `${root}${QUALITY_DISPLAY[quality]}`
      }
    }
  }

  return bestMatch || null
}
