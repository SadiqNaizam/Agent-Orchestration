import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'

const BLANK = (agents) => ({
  id: `task-${Date.now()}`,
  description: '',
  expected_output: 'A detailed and accurate response to the task',
  agent_id: agents[0]?.id || '',
})

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function TaskCard({ task, onChange, onDelete, index, agents }) {
  const [open, setOpen] = useState(true)

  const set = (key) => (e) => onChange({ ...task, [key]: e.target.value })

  const inputCls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"
  const textareaCls = `${inputCls} resize-none leading-relaxed`

  const assignedAgent = agents.find(a => a.id === task.agent_id)

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ClipboardList size={14} className="text-violet-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-200">
            Task {index + 1}
          </span>
          {assignedAgent && (
            <span className="text-xs text-slate-500">→ {assignedAgent.name || 'Unnamed'}</span>
          )}
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

      {open && (
        <div className="p-3 flex flex-col gap-3 bg-slate-900/50">
          <Field label="Description *">
            <textarea
              className={textareaCls}
              rows={3}
              value={task.description}
              onChange={set('description')}
              placeholder="Describe what this task should accomplish…"
            />
          </Field>
          <Field label="Expected Output">
            <textarea
              className={textareaCls}
              rows={2}
              value={task.expected_output}
              onChange={set('expected_output')}
              placeholder="Describe the expected format/content of the output…"
            />
          </Field>
          <Field label="Assigned Agent *">
            <select className={inputCls} value={task.agent_id} onChange={set('agent_id')}>
              {agents.length === 0 && <option value="">— Add agents first —</option>}
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name || 'Unnamed agent'}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  )
}

export default function TaskBuilder({ tasks, setTasks, agents }) {
  const add = () => setTasks(prev => [...prev, BLANK(agents)])
  const remove = (id) => setTasks(prev => prev.filter(t => t.id !== id))
  const update = (id, updated) => setTasks(prev => prev.map(t => t.id === id ? updated : t))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Tasks <span className="text-slate-500 font-normal">({tasks.length})</span>
        </h2>
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-violet-600/20 text-violet-400 border border-violet-600/30 hover:bg-violet-600/30 transition-colors"
        >
          <Plus size={12} /> Add Task
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-xs border border-dashed border-slate-700 rounded-lg">
          No tasks yet.<br />Click "Add Task" to get started.
        </div>
      )}

      {tasks.map((task, i) => (
        <TaskCard
          key={task.id}
          index={i}
          task={task}
          agents={agents}
          onChange={(updated) => update(task.id, updated)}
          onDelete={() => remove(task.id)}
        />
      ))}

      {tasks.length > 1 && (
        <p className="text-xs text-slate-500 mt-2 text-center">
          Tasks run in order (top → bottom) in sequential mode
        </p>
      )}
    </div>
  )
}
