import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { CHORD_LIBRARY, getChordsByDifficulty } from '../../data/chords'
import { ChordDiagram } from './index'

const TABS = ['All', 'Beginner', 'Intermediate', 'Advanced'] as const

export function ChordLibrary() {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('All')
  const [selected, setSelected] = useState<string | null>(null)

  const grouped = getChordsByDifficulty()
  const difficultyFilter: string[] =
    activeTab === 'Beginner' ? grouped.beginner :
    activeTab === 'Intermediate' ? grouped.intermediate :
    activeTab === 'Advanced' ? grouped.advanced : []

  const chords = CHORD_LIBRARY.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
    const matchesDiff = activeTab === 'All' || difficultyFilter.includes(c.name)
    return matchesSearch && matchesDiff
  })

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">Chord Library</h1>
        <p className="text-white/60 mt-1">Browse animated chord diagrams with finger positions</p>
      </div>

      {/* Search + tabs */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chords… (e.g. Am, G7)"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-chord-detected/60"
          />
        </div>
        <div className="flex gap-2">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-chord-detected text-black'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
        layout
      >
        {chords.map((chord, i) => (
          <motion.div
            key={chord.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => setSelected(selected === chord.name ? null : chord.name)}
          >
            <ChordDiagram
              chordName={chord.name}
              highlighted={selected === chord.name}
              size="md"
              animated
            />
          </motion.div>
        ))}
      </motion.div>

      {chords.length === 0 && (
        <div className="text-center text-white/30 py-16">No chords found for "{search}"</div>
      )}
    </div>
  )
}
