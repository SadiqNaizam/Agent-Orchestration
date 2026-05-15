import type { LearningSong } from '../types'

export const LEARNING_SONGS: LearningSong[] = [
  {
    id: 'knockin-heavens-door',
    title: "Knockin' on Heaven's Door",
    artist: 'Bob Dylan',
    difficulty: 'beginner',
    chords: ['G', 'D', 'Am', 'C'],
    bpm: 72,
    description: 'A classic 4-chord song, perfect for beginners. Focus on smooth chord transitions.',
    tab: {
      id: 'knockin-tab',
      title: "Knockin' on Heaven's Door",
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
      measures: [
        {
          timeSignature: [4, 4], bpm: 72,
          notes: [
            { string: 5, fret: 3, duration: 1 },
            { string: 4, fret: 2, duration: 1 },
            { string: 3, fret: 0, duration: 1 },
            { string: 2, fret: 0, duration: 1 },
          ],
        },
        {
          timeSignature: [4, 4], bpm: 72,
          notes: [
            { string: 5, fret: -1, duration: 0.5 },
            { string: 4, fret: 0, duration: 0.5 },
            { string: 3, fret: 2, duration: 0.5 },
            { string: 2, fret: 3, duration: 0.5 },
            { string: 5, fret: -1, duration: 1 },
            { string: 4, fret: 0, duration: 1 },
          ],
        },
      ],
    },
  },
  {
    id: 'wish-you-were-here',
    title: 'Wish You Were Here (Intro)',
    artist: 'Pink Floyd',
    difficulty: 'intermediate',
    chords: ['C', 'D', 'Am', 'G'],
    bpm: 66,
    description: 'The iconic 12-string intro. Practice the fingerpicking pattern slowly first.',
    tab: {
      id: 'wywh-tab',
      title: 'Wish You Were Here Intro',
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
      measures: [
        {
          timeSignature: [4, 4], bpm: 66,
          notes: [
            { string: 4, fret: 0, duration: 0.5 },
            { string: 2, fret: 1, duration: 0.5 },
            { string: 3, fret: 2, duration: 0.5 },
            { string: 2, fret: 1, duration: 0.5 },
            { string: 1, fret: 0, duration: 0.5 },
            { string: 2, fret: 1, duration: 0.5 },
            { string: 3, fret: 2, duration: 0.5 },
            { string: 2, fret: 1, duration: 0.5 },
          ],
        },
        {
          timeSignature: [4, 4], bpm: 66,
          notes: [
            { string: 4, fret: 2, duration: 0.5 },
            { string: 2, fret: 3, duration: 0.5 },
            { string: 3, fret: 2, duration: 0.5 },
            { string: 2, fret: 3, duration: 0.5 },
            { string: 1, fret: 2, duration: 0.5 },
            { string: 2, fret: 3, duration: 0.5 },
            { string: 0, fret: 0, duration: 1 },
          ],
        },
      ],
    },
  },
  {
    id: 'smoke-on-water',
    title: 'Smoke on the Water (Riff)',
    artist: 'Deep Purple',
    difficulty: 'beginner',
    chords: [],
    bpm: 112,
    description: 'The most famous rock riff ever. Great for building picking speed and accuracy.',
    tab: {
      id: 'sotw-tab',
      title: 'Smoke on the Water Riff',
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
      measures: [
        {
          timeSignature: [4, 4], bpm: 112,
          notes: [
            { string: 3, fret: 0, duration: 0.5 },
            { string: 3, fret: 3, duration: 0.5 },
            { string: 3, fret: 5, duration: 1 },
            { string: 3, fret: 0, duration: 0.5 },
            { string: 3, fret: 3, duration: 0.5 },
            { string: 3, fret: 6, duration: 0.25 },
            { string: 3, fret: 5, duration: 0.75 },
          ],
        },
        {
          timeSignature: [4, 4], bpm: 112,
          notes: [
            { string: 3, fret: 0, duration: 0.5 },
            { string: 3, fret: 3, duration: 0.5 },
            { string: 3, fret: 5, duration: 0.5 },
            { string: 3, fret: 3, duration: 0.5 },
            { string: 3, fret: 0, duration: 2 },
          ],
        },
      ],
    },
  },
  {
    id: 'hotel-california',
    title: 'Hotel California (Intro)',
    artist: 'Eagles',
    difficulty: 'advanced',
    chords: ['Bm', 'F#', 'A', 'E', 'G', 'D', 'Em', 'F#'],
    bpm: 74,
    description: 'One of the most beautiful guitar pieces. The arpeggiated intro requires clean technique.',
    tab: {
      id: 'hc-tab',
      title: 'Hotel California Intro',
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
      measures: [
        {
          timeSignature: [4, 4], bpm: 74,
          notes: [
            { string: 4, fret: 2, duration: 0.5 },
            { string: 3, fret: 4, duration: 0.5 },
            { string: 2, fret: 4, duration: 0.5 },
            { string: 1, fret: 3, duration: 0.5 },
            { string: 0, fret: 2, duration: 0.5 },
            { string: 1, fret: 3, duration: 0.5 },
            { string: 2, fret: 4, duration: 0.5 },
            { string: 1, fret: 3, duration: 0.5 },
          ],
        },
      ],
    },
  },
]
