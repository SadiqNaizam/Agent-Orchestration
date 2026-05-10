import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react'

const cls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"
const PROVIDERS = ['openai', 'azure', 'anthropic', 'google', 'cohere']

function blankAgent(suffix = '') {
  return {
    agent_id: `agent${suffix}`,
    name: '',
    description: '',
    system_prompt: '',
    instructions: '',
    model: { provider: 'openai', model_name: 'gpt-4o-mini', temperature: null, max_tokens: null },
    tools: [],
  }
}

// ── Inline mini agent form ─────────────────────────────────────────────────────
function AgentForm({ label, agent, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-700 rounded mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-750 text-xs text-slate-300 transition-colors"
      >
        <span className="font-medium text-slate-400">{label}: <span className="text-indigo-300 font-mono">{agent.agent_id || '—'}</span></span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="p-3 flex flex-col gap-2 bg-slate-900/60">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Agent ID *</label>
              <input className={cls} value={agent.agent_id}
                onChange={e => onChange({ ...agent, agent_id: e.target.value })}
                placeholder="researcher" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Name</label>
              <input className={cls} value={agent.name || ''}
                onChange={e => onChange({ ...agent, name: e.target.value })}
                placeholder="Researcher" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Description</label>
            <input className={cls} value={agent.description || ''}
              onChange={e => onChange({ ...agent, description: e.target.value })}
              placeholder="Brief description of what this agent does" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Provider</label>
              <select className={cls} value={agent.model.provider}
                onChange={e => onChange({ ...agent, model: { ...agent.model, provider: e.target.value } })}>
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Model</label>
              <input className={cls} value={agent.model.model_name}
                onChange={e => onChange({ ...agent, model: { ...agent.model, model_name: e.target.value } })}
                placeholder="gpt-4o-mini" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">System Prompt *</label>
            <textarea className={`${cls} font-mono resize-none`} rows={3}
              value={agent.system_prompt}
              onChange={e => onChange({ ...agent, system_prompt: e.target.value })}
              placeholder="You are a…" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Instructions *</label>
            <textarea className={`${cls} font-mono resize-none`} rows={3}
              value={agent.instructions}
              onChange={e => onChange({ ...agent, instructions: e.target.value })}
              placeholder="Your task is to…" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── main_sub_agent preset card ─────────────────────────────────────────────────
function MainSubAgentCard({ preset, onChange, onDelete }) {
  const [open, setOpen] = useState(true)

  const setMain = (a) => onChange({ ...preset, main_agent: a })
  const setSubs = (subs) => onChange({ ...preset, sub_agents: subs })
  const setSpawn = (spawn) => onChange({ ...preset, spawnable_agents: spawn })

  const addSub = () => setSubs([...(preset.sub_agents || []), {
    agent: blankAgent(`_sub${(preset.sub_agents || []).length + 1}`),
    context_mode: 'scoped',
  }])

  const addSpawn = () => setSpawn([...(preset.spawnable_agents || []),
    blankAgent(`_spawn${(preset.spawnable_agents || []).length + 1}`)])

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-indigo-400" />
          <span className="text-xs font-medium text-slate-300">
            main_sub_agent · <span className="font-mono text-indigo-300">{preset.preset_id}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
            <Trash2 size={12} />
          </button>
          {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3 bg-slate-900/50">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Preset ID *</label>
              <input className={cls} value={preset.preset_id}
                onChange={e => onChange({ ...preset, preset_id: e.target.value })}
                placeholder="msa1" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Max Iterations</label>
              <input type="number" min="1" max="50" className={cls}
                value={preset.max_iterations || 10}
                onChange={e => onChange({ ...preset, max_iterations: parseInt(e.target.value) })} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Exit Signal</label>
            <input className={`${cls} font-mono`} value={preset.exit_signal || 'final_response'}
              onChange={e => onChange({ ...preset, exit_signal: e.target.value })}
              placeholder="final_response" />
          </div>

          <div className="border-t border-slate-700/60 pt-3">
            <p className="text-xs text-slate-400 font-medium mb-2">Main Agent (Orchestrator)</p>
            <AgentForm label="Main" agent={preset.main_agent || blankAgent('_main')} onChange={setMain} />
          </div>

          <div className="border-t border-slate-700/60 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-400 font-medium">Sub-Agents ({(preset.sub_agents || []).length})</p>
              <button onClick={addSub}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/30 transition-colors">
                <Plus size={11} /> Add
              </button>
            </div>
            {(preset.sub_agents || []).map((sub, i) => (
              <div key={i} className="relative">
                <AgentForm
                  label={`Sub ${i + 1}`}
                  agent={sub.agent}
                  onChange={(a) => setSubs(preset.sub_agents.map((s, j) => j === i ? { ...s, agent: a } : s))}
                />
                <div className="flex gap-2 items-center px-3 pb-2 bg-slate-900/60 -mt-2">
                  <label className="text-xs text-slate-500">Context mode:</label>
                  <select className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300"
                    value={sub.context_mode || 'scoped'}
                    onChange={e => setSubs(preset.sub_agents.map((s, j) => j === i ? { ...s, context_mode: e.target.value } : s))}>
                    <option value="scoped">scoped</option>
                    <option value="shared">shared</option>
                  </select>
                  <button onClick={() => setSubs(preset.sub_agents.filter((_, j) => j !== i))}
                    className="ml-auto p-1 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-700/60 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-400 font-medium">Spawnable Agents ({(preset.spawnable_agents || []).length})</p>
              <button onClick={addSpawn}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-600/20 text-slate-400 border border-slate-600/30 hover:bg-slate-600/30 transition-colors">
                <Plus size={11} /> Add
              </button>
            </div>
            {(preset.spawnable_agents || []).map((agent, i) => (
              <div key={i} className="relative">
                <AgentForm
                  label={`Spawnable ${i + 1}`}
                  agent={agent}
                  onChange={(a) => setSpawn(preset.spawnable_agents.map((s, j) => j === i ? a : s))}
                />
                <div className="flex justify-end px-3 pb-2 bg-slate-900/60 -mt-2">
                  <button onClick={() => setSpawn(preset.spawnable_agents.filter((_, j) => j !== i))}
                    className="p-1 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── team preset card ───────────────────────────────────────────────────────────
function TeamCard({ preset, onChange, onDelete }) {
  const [open, setOpen] = useState(true)

  const addMember = () => onChange({
    ...preset,
    members: [...(preset.members || []), {
      agent: blankAgent(`_m${(preset.members || []).length + 1}`),
    }],
  })

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-emerald-400" />
          <span className="text-xs font-medium text-slate-300">
            team · <span className="font-mono text-emerald-300">{preset.preset_id}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
            <Trash2 size={12} />
          </button>
          {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3 bg-slate-900/50">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Preset ID *</label>
              <input className={cls} value={preset.preset_id}
                onChange={e => onChange({ ...preset, preset_id: e.target.value })}
                placeholder="team1" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Execution</label>
              <select className={cls} value={preset.execution || 'sequential'}
                onChange={e => onChange({ ...preset, execution: e.target.value })}>
                <option value="sequential">sequential</option>
                <option value="parallel">parallel</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Context Sharing</label>
              <select className={cls} value={preset.context_sharing || 'shared'}
                onChange={e => onChange({ ...preset, context_sharing: e.target.value })}>
                <option value="shared">shared</option>
                <option value="isolated">isolated</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Merge Strategy</label>
              <select className={cls} value={preset.merge_strategy || 'concatenate'}
                onChange={e => onChange({ ...preset, merge_strategy: e.target.value })}>
                <option value="concatenate">concatenate</option>
                <option value="summarize">summarize (needs merge agent)</option>
              </select>
            </div>
          </div>

          {preset.merge_strategy === 'summarize' && (
            <div className="border-t border-slate-700/60 pt-3">
              <p className="text-xs text-slate-400 font-medium mb-2">Merge Agent</p>
              <AgentForm
                label="Merge"
                agent={preset.merge_agent || blankAgent('_merge')}
                onChange={(a) => onChange({ ...preset, merge_agent: a })}
              />
            </div>
          )}

          <div className="border-t border-slate-700/60 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-400 font-medium">Members ({(preset.members || []).length})</p>
              <button onClick={addMember}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30 transition-colors">
                <Plus size={11} /> Add
              </button>
            </div>
            {(preset.members || []).map((m, i) => (
              <div key={i} className="relative">
                <AgentForm
                  label={`Member ${i + 1}`}
                  agent={m.agent}
                  onChange={(a) => onChange({
                    ...preset,
                    members: preset.members.map((mem, j) => j === i ? { ...mem, agent: a } : mem),
                  })}
                />
                <div className="flex justify-end px-3 pb-2 bg-slate-900/60 -mt-2">
                  <button onClick={() => onChange({ ...preset, members: preset.members.filter((_, j) => j !== i) })}
                    className="p-1 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── hierarchical preset card ───────────────────────────────────────────────────
function HierarchicalCard({ preset, onChange, onDelete }) {
  const [open, setOpen] = useState(true)

  const addLevel = () => onChange({
    ...preset,
    levels: [...(preset.levels || []), {
      supervisor: blankAgent(`_sup${(preset.levels || []).length + 1}`),
      subordinates: [],
    }],
  })

  const addSub = (lvlIdx) => {
    const levels = preset.levels.map((lvl, i) => i === lvlIdx ? {
      ...lvl,
      subordinates: [...(lvl.subordinates || []), {
        agent: blankAgent(`_sub${lvl.subordinates.length + 1}`),
        context_mode: 'scoped',
      }],
    } : lvl)
    onChange({ ...preset, levels })
  }

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-amber-400" />
          <span className="text-xs font-medium text-slate-300">
            hierarchical · <span className="font-mono text-amber-300">{preset.preset_id}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
            <Trash2 size={12} />
          </button>
          {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3 bg-slate-900/50">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Preset ID *</label>
            <input className={cls} value={preset.preset_id}
              onChange={e => onChange({ ...preset, preset_id: e.target.value })}
              placeholder="hier1" />
          </div>

          <div className="border-t border-slate-700/60 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-400 font-medium">Levels ({(preset.levels || []).length})</p>
              <button onClick={addLevel}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-600/20 text-amber-400 border border-amber-600/30 hover:bg-amber-600/30 transition-colors">
                <Plus size={11} /> Add Level
              </button>
            </div>
            {(preset.levels || []).map((lvl, lvlIdx) => (
              <div key={lvlIdx} className="border border-slate-700/60 rounded p-2 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-amber-400/70 font-medium">Level {lvlIdx + 1}</span>
                  <button onClick={() => onChange({ ...preset, levels: preset.levels.filter((_, i) => i !== lvlIdx) })}
                    className="p-0.5 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
                <AgentForm
                  label="Supervisor"
                  agent={lvl.supervisor}
                  onChange={(a) => onChange({
                    ...preset,
                    levels: preset.levels.map((l, i) => i === lvlIdx ? { ...l, supervisor: a } : l),
                  })}
                />
                <div className="pl-2 border-l border-amber-500/20 mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">Subordinates ({(lvl.subordinates || []).length})</span>
                    <button onClick={() => addSub(lvlIdx)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-slate-500 border border-slate-700 hover:text-slate-300 hover:border-slate-600 transition-colors">
                      <Plus size={10} /> Sub
                    </button>
                  </div>
                  {(lvl.subordinates || []).map((sub, subIdx) => (
                    <div key={subIdx} className="relative">
                      <AgentForm
                        label={`Sub ${subIdx + 1}`}
                        agent={sub.agent}
                        onChange={(a) => {
                          const levels = preset.levels.map((l, li) => li === lvlIdx ? {
                            ...l,
                            subordinates: l.subordinates.map((s, si) => si === subIdx ? { ...s, agent: a } : s),
                          } : l)
                          onChange({ ...preset, levels })
                        }}
                      />
                      <div className="flex items-center gap-2 px-3 pb-2 bg-slate-900/60 -mt-2">
                        <label className="text-xs text-slate-500">Context:</label>
                        <select className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300"
                          value={sub.context_mode || 'scoped'}
                          onChange={e => {
                            const levels = preset.levels.map((l, li) => li === lvlIdx ? {
                              ...l,
                              subordinates: l.subordinates.map((s, si) => si === subIdx ? { ...s, context_mode: e.target.value } : s),
                            } : l)
                            onChange({ ...preset, levels })
                          }}>
                          <option value="scoped">scoped</option>
                          <option value="shared">shared</option>
                        </select>
                        <button onClick={() => {
                          const levels = preset.levels.map((l, li) => li === lvlIdx ? {
                            ...l,
                            subordinates: l.subordinates.filter((_, si) => si !== subIdx),
                          } : l)
                          onChange({ ...preset, levels })
                        }}
                          className="ml-auto p-0.5 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function PresetBuilder({ presets, setPresets }) {
  const addPreset = (pattern) => {
    const id = `${pattern.replace('_', '')}_${Date.now()}`
    const base = { pattern, preset_id: id }
    let preset
    if (pattern === 'main_sub_agent') {
      preset = {
        ...base,
        main_agent: blankAgent('_main'),
        sub_agents: [],
        spawnable_agents: [],
        max_iterations: 10,
        exit_signal: 'final_response',
      }
    } else if (pattern === 'team') {
      preset = {
        ...base,
        execution: 'sequential',
        context_sharing: 'shared',
        merge_strategy: 'concatenate',
        members: [],
      }
    } else {
      preset = {
        ...base,
        levels: [],
      }
    }
    setPresets(prev => [...prev, preset])
  }

  const update = (i, p) => setPresets(prev => prev.map((x, j) => j === i ? p : x))
  const remove = (i) => setPresets(prev => prev.filter((_, j) => j !== i))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Presets <span className="text-slate-500 font-normal">({presets.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          {[
            ['main_sub_agent', 'MSA', 'bg-indigo-600/20 text-indigo-400 border-indigo-600/30 hover:bg-indigo-600/30'],
            ['team',           'Team', 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/30'],
            ['hierarchical',   'Hier', 'bg-amber-600/20 text-amber-400 border-amber-600/30 hover:bg-amber-600/30'],
          ].map(([pattern, label, btnCls]) => (
            <button key={pattern} onClick={() => addPreset(pattern)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${btnCls}`}>
              <Plus size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      {presets.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-xs border border-dashed border-slate-700 rounded-lg">
          No presets yet.<br />
          Add a preset pattern to configure a reusable multi-agent topology.<br />
          <span className="text-slate-600">MSA = orchestrator + sub-agents, Team = parallel/sequential members, Hier = supervisor chains</span>
        </div>
      )}

      {presets.map((preset, i) => {
        const props = { key: i, preset, onChange: (p) => update(i, p), onDelete: () => remove(i) }
        if (preset.pattern === 'main_sub_agent') return <MainSubAgentCard {...props} />
        if (preset.pattern === 'team')           return <TeamCard {...props} />
        if (preset.pattern === 'hierarchical')   return <HierarchicalCard {...props} />
        return (
          <div key={i} className="border border-red-700/40 rounded p-3 mb-2 text-xs text-red-400">
            Unknown pattern: {preset.pattern}
          </div>
        )
      })}
    </div>
  )
}
