export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'

export type ChordQuality = 'major' | 'minor' | 'dominant7' | 'major7' | 'minor7' | 'sus2' | 'sus4' | 'dim' | 'aug'

export interface ChordVoicing {
  /** fret number per string (0=open, -1=muted), index 0 = low E */
  frets: [number, number, number, number, number, number]
  fingers: [number, number, number, number, number, number]
  barre?: { fret: number; fromString: number; toString: number }
}

export interface Chord {
  root: NoteName
  quality: ChordQuality
  name: string
  voicings: ChordVoicing[]
}

export interface DetectedNote {
  frequency: number
  note: NoteName
  octave: number
  cents: number
  confidence: number
}

export interface TabNote {
  string: number  // 0-5 (low E to high E)
  fret: number
  duration: number // in beats
  technique?: 'normal' | 'hammer-on' | 'pull-off' | 'bend' | 'slide-up' | 'slide-down' | 'vibrato'
}

export interface TabMeasure {
  notes: TabNote[]
  timeSignature: [number, number]
  bpm: number
}

export interface Tab {
  id: string
  title: string
  artist?: string
  tuning: [NoteName, NoteName, NoteName, NoteName, NoteName, NoteName]
  measures: TabMeasure[]
}

export interface LearningSong {
  id: string
  title: string
  artist: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  chords: string[]
  tab: Tab
  bpm: number
  description: string
}

export type AppMode = 'home' | 'detect' | 'chords' | 'tabs' | 'learn'
