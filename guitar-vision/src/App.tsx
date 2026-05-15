import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Navigation } from './components/Navigation'
import { HomePage } from './components/HomePage'
import { ChordDetector } from './components/ChordDetector'
import { ChordLibrary } from './components/ChordDiagram/ChordLibrary'
import { TabBuilder } from './components/TabBuilder'
import { LearningMode } from './components/LearningMode'
import type { AppMode } from './types'

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
}

function AppContent({ mode }: { mode: AppMode }) {
  switch (mode) {
    case 'detect': return <ChordDetector />
    case 'chords': return <ChordLibrary />
    case 'tabs':   return <TabBuilder />
    case 'learn':  return <LearningMode />
    default:       return null
  }
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('home')

  return (
    <div className="min-h-screen bg-guitar-body text-white">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-chord-detected/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-chord-major/5 rounded-full blur-3xl" />
      </div>

      <Navigation activeMode={mode} onModeChange={setMode} />

      <main className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {mode === 'home' ? (
              <HomePage onModeSelect={setMode} />
            ) : (
              <AppContent mode={mode} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
