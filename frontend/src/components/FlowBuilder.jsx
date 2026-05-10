import { GitBranch, Users } from 'lucide-react'
import { LLM_MODELS } from '../App'

const PROCESSES = [
  {
    id: 'sequential',
    label: 'Sequential',
    Icon: GitBranch,
    description: 'Tasks run one after another in order. Each agent gets the full context from previous tasks.',
    color: 'indigo',
  },
  {
    id: 'hierarchical',
    label: 'Hierarchical',
    Icon: Users,
    description: 'A manager LLM coordinates agents and assigns tasks dynamically. More autonomous, best for complex goals.',
    color: 'violet',
  },
]

export default function FlowBuilder({ flow, setFlow }) {
  const inputCls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"

  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">
        Execution Flow
      </h2>

      {/* Process selector */}
      <div className="flex flex-col gap-2 mb-5">
        {PROCESSES.map(({ id, label, Icon, description, color }) => {
          const active = flow.process === id
          return (
            <button
              key={id}
              onClick={() => setFlow(f => ({ ...f, process: id }))}
              className={`text-left p-3 rounded-lg border transition-all
                ${active
                  ? `border-${color}-500 bg-${color}-500/10`
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center
                  ${active ? `border-${color}-400` : 'border-slate-600'}`}
                >
                  {active && <div className={`w-1.5 h-1.5 rounded-full bg-${color}-400`} />}
                </div>
                <Icon size={13} className={active ? `text-${color}-400` : 'text-slate-500'} />
                <span className={`text-xs font-semibold ${active ? `text-${color}-300` : 'text-slate-300'}`}>
                  {label}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pl-5">{description}</p>
            </button>
          )
        })}
      </div>

      {/* Manager LLM (only for hierarchical) */}
      {flow.process === 'hierarchical' && (
        <div className="border border-violet-500/30 bg-violet-500/5 rounded-lg p-3">
          <label className="text-xs text-slate-400 block mb-1.5">Manager LLM</label>
          <select
            className={inputCls}
            value={flow.manager_llm}
            onChange={(e) => setFlow(f => ({ ...f, manager_llm: e.target.value }))}
          >
            {LLM_MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-2">
            This model acts as the orchestrator, delegating tasks to the right agents.
          </p>
        </div>
      )}

      {/* Flow diagram (visual hint) */}
      <div className="mt-5 border border-slate-700 rounded-lg p-3 bg-slate-800/30">
        <p className="text-xs text-slate-500 mb-3 text-center">Execution Preview</p>
        <div className="flex flex-col items-center gap-1 text-xs">
          {flow.process === 'sequential' ? (
            <>
              <div className="px-3 py-1 rounded border border-indigo-500/40 text-indigo-300 bg-indigo-500/10">Input</div>
              <div className="text-slate-600">↓</div>
              <div className="px-3 py-1 rounded border border-slate-600 text-slate-400">Task 1 → Agent</div>
              <div className="text-slate-600">↓</div>
              <div className="px-3 py-1 rounded border border-slate-600 text-slate-400">Task 2 → Agent</div>
              <div className="text-slate-600">↓</div>
              <div className="px-3 py-1 rounded border border-green-500/40 text-green-300 bg-green-500/10">Output</div>
            </>
          ) : (
            <>
              <div className="px-3 py-1 rounded border border-violet-500/40 text-violet-300 bg-violet-500/10">Manager LLM</div>
              <div className="text-slate-600">↙ ↘</div>
              <div className="flex gap-3">
                <div className="px-3 py-1 rounded border border-slate-600 text-slate-400">Agent A</div>
                <div className="px-3 py-1 rounded border border-slate-600 text-slate-400">Agent B</div>
              </div>
              <div className="text-slate-600">↘ ↙</div>
              <div className="px-3 py-1 rounded border border-green-500/40 text-green-300 bg-green-500/10">Output</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
