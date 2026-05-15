import { motion } from 'framer-motion'

interface TunerNeedleProps {
  cents: number
}

export function TunerNeedle({ cents }: TunerNeedleProps) {
  const clamped = Math.max(-50, Math.min(50, cents))
  const rotation = (clamped / 50) * 45
  const inTune = Math.abs(cents) < 10

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-16 overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full border-2 border-white/20" />
        <motion.div
          className="absolute bottom-0 left-1/2 origin-bottom w-0.5 h-14"
          style={{ background: inTune ? '#00FF88' : '#FF6B35' }}
          animate={{ rotate: rotation }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
      </div>
      <div className="flex justify-between w-32 text-xs text-white/40">
        <span>-50</span>
        <span className={inTune ? 'text-chord-detected' : 'text-white/60'}>0</span>
        <span>+50</span>
      </div>
      <span className={`text-xs font-mono ${inTune ? 'text-chord-detected' : 'text-guitar-fret'}`}>
        {inTune ? 'In tune!' : `${cents > 0 ? '+' : ''}${cents}¢`}
      </span>
    </div>
  )
}
