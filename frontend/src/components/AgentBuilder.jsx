import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Bot } from 'lucide-react'
import { LLM_MODELS } from '../App'

const BLANK = () => ({
  id: `agent-${Date.now()}`,
  name: '',
  role: '',
  goal: '',
  backstory: '',
  llm: 'openai/gpt-4o-mini',
})

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function AgentCard({ agent, onChange, onDelete, index }) {
  const [open, setOpen] = useState(true)

  const set = (key) => (e) => onChange({ ...agent, [key]: e.target.value })

  const inputCls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"
  const textareaCls = `${inputCls} resize-none leading-relaxed`

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden mb-3">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">
            {agent.name || `Agent ${index + 1}`}
          </span>
          <span className="text-xs text-slate-500 truncate max-w-[100px]">{agent.llm.split('/')[1]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
          {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="p-3 flex flex-col gap-3 bg-slate-900/50">
          <Field label="Name *">
            <input className={inputCls} value={agent.name} onChange={set('name')} placeholder="e.g. Researcher" />
          </Field>
          <Field label="Role *">
            <input className={inputCls} value={agent.role} onChange={set('role')} placeholder="e.g. Senior Research Analyst" />
          </Field>
          <Field label="Goal *">
            <textarea className={textareaCls} rows={2} value={agent.goal} onChange={set('goal')} placeholder="What this agent aims to accomplish…" />
          </Field>
          <Field label="Backstory">
            <textarea className={textareaCls} rows={2} value={agent.backstory} onChange={set('backstory')} placeholder="(optional) Background and personality…" />
          </Field>
          <Field label="LLM Model">
            <select className={inputCls} value={agent.llm} onChange={set('llm')}>
              {LLM_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  )
}

export default function AgentBuilder({ agents, setAgents }) {
  const add = () => setAgents(prev => [...prev, BLANK()])
  const remove = (id) => setAgents(prev => prev.filter(a => a.id !== id))
  const update = (id, updated) => setAgents(prev => prev.map(a => a.id === id ? updated : a))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Agents <span className="text-slate-500 font-normal">({agents.length})</span>
        </h2>
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/30 transition-colors"
        >
          <Plus size={12} /> Add Agent
        </button>
      </div>

      {agents.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-xs border border-dashed border-slate-700 rounded-lg">
          No agents yet.<br />Click "Add Agent" to get started.
        </div>
      )}

      {agents.map((agent, i) => (
        <AgentCard
          key={agent.id}
          index={i}
          agent={agent}
          onChange={(updated) => update(agent.id, updated)}
          onDelete={() => remove(agent.id)}
        />
      ))}
    </div>
  )
}
