import { motion } from 'framer-motion'
import { Mic, Music, PenLine, BookOpen, Zap } from 'lucide-react'
import type { AppMode } from '../types'

interface HomePageProps {
  onModeSelect: (mode: AppMode) => void
}

const FEATURES = [
  {
    mode: 'detect' as AppMode,
    icon: <Mic size={28} />,
    title: 'Live Chord Detection',
    description: 'Play your guitar near the mic. Real-time pitch analysis identifies chords using the YIN algorithm.',
    color: 'from-chord-detected/20 to-chord-detected/5',
    border: 'border-chord-detected/30',
    iconColor: 'text-chord-detected',
  },
  {
    mode: 'chords' as AppMode,
    icon: <Music size={28} />,
    title: 'Chord Library',
    description: 'Browse 20+ animated chord diagrams with finger positions, barre chords, and difficulty ratings.',
    color: 'from-chord-major/20 to-chord-major/5',
    border: 'border-chord-major/30',
    iconColor: 'text-chord-major',
  },
  {
    mode: 'tabs' as AppMode,
    icon: <PenLine size={28} />,
    title: 'Tab Builder',
    description: 'Build guitar tabs on an interactive fretboard. Add techniques, export as ASCII tab notation.',
    color: 'from-chord-minor/20 to-chord-minor/5',
    border: 'border-chord-minor/30',
    iconColor: 'text-chord-minor',
  },
  {
    mode: 'learn' as AppMode,
    icon: <BookOpen size={28} />,
    title: 'Learn Songs',
    description: 'Follow animated fret guidance through classic songs. Smoke on the Water to Hotel California.',
    color: 'from-chord-seventh/20 to-chord-seventh/5',
    border: 'border-chord-seventh/30',
    iconColor: 'text-chord-seventh',
  },
]

export function HomePage({ onModeSelect }: HomePageProps) {
  return (
    <div className="flex flex-col items-center gap-12 p-6 py-16 max-w-4xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-chord-detected/10 border border-chord-detected/30 rounded-full text-chord-detected text-sm mb-6">
          <Zap size={14} />
          Real-time pitch detection · Interactive fretboard · Song lessons
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-white mb-4 leading-tight">
          Learn Guitar<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-chord-detected to-chord-major">
            the Smart Way
          </span>
        </h1>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          GuitarVision listens to your playing, identifies chords in real time, and guides you through songs with animated fret diagrams.
        </p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onModeSelect('detect')}
          className="mt-8 px-8 py-4 bg-chord-detected text-black font-bold rounded-2xl text-lg hover:brightness-110 transition-all"
        >
          Start Detecting →
        </motion.button>
      </motion.div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {FEATURES.map((feature, i) => (
          <motion.div
            key={feature.mode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ scale: 1.02, y: -2 }}
            onClick={() => onModeSelect(feature.mode)}
            className={`bg-gradient-to-br ${feature.color} border ${feature.border} rounded-2xl p-6 cursor-pointer transition-all hover:shadow-lg`}
          >
            <div className={`mb-4 ${feature.iconColor}`}>{feature.icon}</div>
            <h3 className="text-white font-bold text-lg mb-2">{feature.title}</h3>
            <p className="text-white/50 text-sm leading-relaxed">{feature.description}</p>
          </motion.div>
        ))}
      </div>

      {/* Tech stack note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-center text-white/20 text-xs"
      >
        Built with React · Web Audio API · Framer Motion · YIN Pitch Detection
      </motion.div>
    </div>
  )
}
