import { motion } from 'framer-motion'
import { Mic, BookOpen, Music, PenLine, Home } from 'lucide-react'
import type { AppMode } from '../types'

interface NavItem {
  mode: AppMode
  label: string
  icon: React.ReactNode
  description: string
}

const NAV_ITEMS: NavItem[] = [
  { mode: 'home', label: 'Home', icon: <Home size={20} />, description: 'Overview' },
  { mode: 'detect', label: 'Detect', icon: <Mic size={20} />, description: 'Live chord detection' },
  { mode: 'chords', label: 'Chords', icon: <Music size={20} />, description: 'Chord library' },
  { mode: 'tabs', label: 'Tab Builder', icon: <PenLine size={20} />, description: 'Build guitar tabs' },
  { mode: 'learn', label: 'Learn', icon: <BookOpen size={20} />, description: 'Songs & lessons' },
]

interface NavigationProps {
  activeMode: AppMode
  onModeChange: (mode: AppMode) => void
}

export function Navigation({ activeMode, onModeChange }: NavigationProps) {
  return (
    <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chord-detected to-chord-major flex items-center justify-center">
            <span className="text-black font-bold text-sm">GV</span>
          </div>
          <span className="text-white font-bold text-lg hidden sm:block">GuitarVision</span>
        </div>

        {/* Nav items */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(item => (
            <motion.button
              key={item.mode}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onModeChange(item.mode)}
              className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeMode === item.mode
                  ? 'text-chord-detected'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {activeMode === item.mode && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-chord-detected/10 border border-chord-detected/30 rounded-xl"
                />
              )}
              <span className="relative">{item.icon}</span>
              <span className="relative hidden sm:block">{item.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </nav>
  )
}
