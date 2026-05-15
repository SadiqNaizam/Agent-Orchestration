import type { Chord } from '../types'

export const CHORD_LIBRARY: Chord[] = [
  {
    root: 'C', quality: 'major', name: 'C',
    voicings: [{
      frets: [-1, 3, 2, 0, 1, 0],
      fingers: [0, 3, 2, 0, 1, 0],
    }],
  },
  {
    root: 'G', quality: 'major', name: 'G',
    voicings: [{
      frets: [3, 2, 0, 0, 0, 3],
      fingers: [2, 1, 0, 0, 0, 3],
    }],
  },
  {
    root: 'D', quality: 'major', name: 'D',
    voicings: [{
      frets: [-1, -1, 0, 2, 3, 2],
      fingers: [0, 0, 0, 1, 3, 2],
    }],
  },
  {
    root: 'A', quality: 'major', name: 'A',
    voicings: [{
      frets: [-1, 0, 2, 2, 2, 0],
      fingers: [0, 0, 1, 2, 3, 0],
    }],
  },
  {
    root: 'E', quality: 'major', name: 'E',
    voicings: [{
      frets: [0, 2, 2, 1, 0, 0],
      fingers: [0, 2, 3, 1, 0, 0],
    }],
  },
  {
    root: 'F', quality: 'major', name: 'F',
    voicings: [{
      frets: [1, 1, 2, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barre: { fret: 1, fromString: 0, toString: 5 },
    }],
  },
  {
    root: 'B', quality: 'major', name: 'B',
    voicings: [{
      frets: [-1, 2, 4, 4, 4, 2],
      fingers: [0, 1, 2, 3, 4, 1],
      barre: { fret: 2, fromString: 1, toString: 5 },
    }],
  },
  {
    root: 'A', quality: 'minor', name: 'Am',
    voicings: [{
      frets: [-1, 0, 2, 2, 1, 0],
      fingers: [0, 0, 2, 3, 1, 0],
    }],
  },
  {
    root: 'E', quality: 'minor', name: 'Em',
    voicings: [{
      frets: [0, 2, 2, 0, 0, 0],
      fingers: [0, 2, 3, 0, 0, 0],
    }],
  },
  {
    root: 'D', quality: 'minor', name: 'Dm',
    voicings: [{
      frets: [-1, -1, 0, 2, 3, 1],
      fingers: [0, 0, 0, 2, 3, 1],
    }],
  },
  {
    root: 'G', quality: 'minor', name: 'Gm',
    voicings: [{
      frets: [3, 5, 5, 3, 3, 3],
      fingers: [1, 3, 4, 1, 1, 1],
      barre: { fret: 3, fromString: 0, toString: 5 },
    }],
  },
  {
    root: 'C', quality: 'minor', name: 'Cm',
    voicings: [{
      frets: [-1, 3, 5, 5, 4, 3],
      fingers: [0, 1, 3, 4, 2, 1],
      barre: { fret: 3, fromString: 1, toString: 5 },
    }],
  },
  {
    root: 'G', quality: 'dominant7', name: 'G7',
    voicings: [{
      frets: [3, 2, 0, 0, 0, 1],
      fingers: [3, 2, 0, 0, 0, 1],
    }],
  },
  {
    root: 'D', quality: 'dominant7', name: 'D7',
    voicings: [{
      frets: [-1, -1, 0, 2, 1, 2],
      fingers: [0, 0, 0, 2, 1, 3],
    }],
  },
  {
    root: 'A', quality: 'dominant7', name: 'A7',
    voicings: [{
      frets: [-1, 0, 2, 0, 2, 0],
      fingers: [0, 0, 2, 0, 3, 0],
    }],
  },
  {
    root: 'E', quality: 'dominant7', name: 'E7',
    voicings: [{
      frets: [0, 2, 0, 1, 0, 0],
      fingers: [0, 2, 0, 1, 0, 0],
    }],
  },
  {
    root: 'C', quality: 'major7', name: 'Cmaj7',
    voicings: [{
      frets: [-1, 3, 2, 0, 0, 0],
      fingers: [0, 3, 2, 0, 0, 0],
    }],
  },
  {
    root: 'D', quality: 'sus4', name: 'Dsus4',
    voicings: [{
      frets: [-1, -1, 0, 2, 3, 3],
      fingers: [0, 0, 0, 1, 3, 4],
    }],
  },
  {
    root: 'A', quality: 'sus2', name: 'Asus2',
    voicings: [{
      frets: [-1, 0, 2, 2, 0, 0],
      fingers: [0, 0, 1, 2, 0, 0],
    }],
  },
]

export const STRING_NOTES = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] as const

export const NOTE_FREQUENCIES: Record<string, number> = {
  'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31,
  'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61,
  'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23,
  'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25,
}

export const ALL_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export function findChordByName(name: string): Chord | undefined {
  return CHORD_LIBRARY.find(c => c.name === name)
}

export function getChordsByDifficulty(): { beginner: string[]; intermediate: string[]; advanced: string[] } {
  return {
    beginner: ['C', 'G', 'D', 'Em', 'Am'],
    intermediate: ['F', 'Bm', 'G7', 'D7', 'Cmaj7'],
    advanced: ['F#m', 'B', 'Gm', 'Cm', 'Dm'],
  }
}
