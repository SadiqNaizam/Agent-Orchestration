import { Check, X, AlertTriangle, Minus } from 'lucide-react'

// ── Step status icon ──────────────────────────────────────────────────────────

function StepIcon({ status, isCurrent }) {
  const base = 'w-5 h-5 rounded-full flex items-center justify-center border transition-all shrink-0'

  if (status === 'completed') {
    return (
      <div className={`${base} bg-green-500 border-green-500`}>
        <Check size={10} strokeWidth={3} className="text-white" />
      </div>
    )
  }
  if (status === 'in_progress') {
    return (
      <div className={`${base} bg-green-500/20 border-green-500 ${isCurrent ? 'ring-2 ring-green-500/40' : ''}`}>
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      </div>
    )
  }
  if (status === 'stale') {
    return (
      <div className={`${base} bg-amber-500/20 border-amber-500/60`}>
        <AlertTriangle size={9} className="text-amber-400" />
      </div>
    )
  }
  if (status === 'skipped') {
    return (
      <div className={`${base} bg-slate-700/40 border-slate-600/40`}>
        <X size={9} className="text-slate-500" />
      </div>
    )
  }
  // pending
  return (
    <div className={`${base} border-slate-600 ${isCurrent ? 'ring-2 ring-indigo-500/40 border-indigo-500/50 bg-indigo-500/10' : 'bg-transparent'}`}>
      <Minus size={9} className="text-slate-600" />
    </div>
  )
}

// ── Step button ───────────────────────────────────────────────────────────────

function StepButton({ step, isCurrent, onNavigate }) {
  const isClickable = step.status === 'completed' || step.status === 'stale'

  return (
    <button
      title={step.label}
      disabled={!isClickable}
      onClick={() => isClickable && onNavigate && onNavigate(step.id)}
      className={`flex flex-col items-center gap-0.5 group transition-opacity ${
        isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
      }`}
    >
      <StepIcon status={step.status} isCurrent={isCurrent} />
      <span className={`text-xs leading-none truncate max-w-16 transition-colors ${
        isCurrent
          ? 'text-indigo-300 font-medium'
          : step.status === 'completed'
            ? 'text-slate-400'
            : step.status === 'skipped'
              ? 'text-slate-700'
              : 'text-slate-500'
      }`}>
        {step.label}
      </span>
    </button>
  )
}

// ── Connector line between steps ──────────────────────────────────────────────

function StepConnector({ done }) {
  return (
    <div className={`flex-1 h-px mx-1 mt-2.5 ${done ? 'bg-green-600/50' : 'bg-slate-700'}`} />
  )
}

// ── Phase group ───────────────────────────────────────────────────────────────

function PhaseGroup({ phase, currentStep, onNavigate, showDivider }) {
  return (
    <div className="flex flex-col gap-1 shrink-0">
      {/* Phase label */}
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 truncate">
        {phase.label}
      </span>

      {/* Steps */}
      <div className="flex items-center">
        {phase.steps.map((step, i) => {
          const isCurrent = step.id === currentStep
          const isDone    = step.status === 'completed'
          return (
            <div key={step.id} className="flex items-center">
              <StepButton step={step} isCurrent={isCurrent} onNavigate={onNavigate} />
              {i < phase.steps.length - 1 && (
                <StepConnector done={isDone && phase.steps[i + 1]?.status === 'completed'} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function PhaseNav({ phases = [], currentPhase, currentStep, onNavigate }) {
  if (!phases.length) return null

  return (
    <div className="flex items-start gap-4 px-4 py-2 max-h-16 overflow-x-auto bg-slate-900 border-b border-slate-800 scrollbar-none">
      {phases.map((phase, i) => (
        <div key={phase.id} className="flex items-center gap-4 shrink-0">
          <PhaseGroup
            phase={phase}
            currentStep={currentStep}
            onNavigate={onNavigate}
            showDivider={i < phases.length - 1}
          />
          {i < phases.length - 1 && (
            <div className="w-px h-8 bg-slate-700/60 shrink-0 mt-4" />
          )}
        </div>
      ))}
    </div>
  )
}
