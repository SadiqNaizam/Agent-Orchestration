import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Cpu, X } from 'lucide-react'

const PROVIDERS = [
  { value: 'openai',    label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini',    label: 'Google Gemini' },
  { value: 'azure',     label: 'Azure OpenAI' },
  { value: 'ollama',    label: 'Ollama (local)' },
]

const MODELS_BY_PROVIDER = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini:    ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
  azure:     [],   // deployment names are custom
  ollama:    ['llama3', 'mistral', 'codellama', 'phi3'],
}

function blankNode() {
  return {
    node_id: `node-${Date.now()}`,
    agent: {
      agent_id: `agent-${Date.now()}`,
      name: '',
      description: '',
      system_prompt: '',
      instructions: '',
      model: { provider: 'openai', model_name: 'gpt-4o-mini', temperature: null, max_tokens: null },
    },
    context_mode: 'scoped',
    input_mapping: {},
    output_mapping: {},
    error_policy: null,
  }
}

// ── Mapping editor ─────────────────────────────────────────────────────────────
function MappingEditor({ label, mapping, onChange }) {
  const entries = Object.entries(mapping)

  const update = (oldKey, newKey, value) => {
    const next = { ...mapping }
    if (oldKey !== newKey) delete next[oldKey]
    next[newKey] = value
    onChange(next)
  }

  const remove = (key) => {
    const next = { ...mapping }
    delete next[key]
    onChange(next)
  }

  const add = () => onChange({ ...mapping, '': '$.input.' })

  const cls = "bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 transition-colors"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400">{label}</label>
        <button
          onClick={add}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
        >
          <Plus size={10} /> add
        </button>
      </div>
      {entries.length === 0 && (
        <p className="text-xs text-slate-600 italic">No mappings</p>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1 items-center">
          <input
            className={`${cls} w-24 shrink-0`}
            value={k}
            placeholder="local_key"
            onChange={(e) => update(k, e.target.value, v)}
          />
          <span className="text-slate-600 text-xs">→</span>
          <input
            className={`${cls} flex-1 font-mono`}
            value={v}
            placeholder="$.input.key"
            onChange={(e) => update(k, k, e.target.value)}
          />
          <button onClick={() => remove(k)} className="text-slate-600 hover:text-red-400 shrink-0">
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Node card ──────────────────────────────────────────────────────────────────
function NodeCard({ node, onChange, onDelete, index }) {
  const [open,     setOpen]     = useState(index === 0)
  const [advanced, setAdvanced] = useState(false)

  const setAgent = (key, val) => onChange({ ...node, agent: { ...node.agent, [key]: val } })
  const setModel = (key, val) => onChange({
    ...node,
    agent: { ...node.agent, model: { ...node.agent.model, [key]: val } },
  })

  const cls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"
  const area = `${cls} resize-none leading-relaxed`

  const provider   = node.agent.model.provider
  const modelNames = MODELS_BY_PROVIDER[provider] || []

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden mb-3">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Cpu size={13} className="text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">
            {node.agent.name || node.node_id || `Node ${index + 1}`}
          </span>
          <span className="text-xs text-slate-500 font-mono truncate">
            {node.node_id}
          </span>
          <span className="text-xs px-1 py-0.5 rounded bg-slate-700 text-slate-400">
            {node.agent.model.provider}/{node.agent.model.model_name}
          </span>
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

          {/* IDs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Node ID *</label>
              <input className={cls} value={node.node_id}
                onChange={e => onChange({ ...node, node_id: e.target.value })}
                placeholder="researcher" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Name</label>
              <input className={cls} value={node.agent.name || ''}
                onChange={e => setAgent('name', e.target.value)}
                placeholder="Researcher" />
            </div>
          </div>

          {/* Model */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Provider *</label>
              <select className={cls} value={provider}
                onChange={e => {
                  const p = e.target.value
                  const m = MODELS_BY_PROVIDER[p]?.[0] || ''
                  onChange({
                    ...node,
                    agent: { ...node.agent, model: { ...node.agent.model, provider: p, model_name: m } },
                  })
                }}>
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Model *</label>
              {modelNames.length > 0 ? (
                <select className={cls} value={node.agent.model.model_name}
                  onChange={e => setModel('model_name', e.target.value)}>
                  {modelNames.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input className={`${cls} font-mono`} value={node.agent.model.model_name}
                  onChange={e => setModel('model_name', e.target.value)}
                  placeholder="my-deployment" />
              )}
            </div>
          </div>

          {/* System Prompt */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">System Prompt *</label>
            <textarea className={area} rows={3}
              value={node.agent.system_prompt}
              onChange={e => setAgent('system_prompt', e.target.value)}
              placeholder="You are a senior research analyst…" />
          </div>

          {/* Instructions */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Instructions *</label>
            <textarea className={area} rows={3}
              value={node.agent.instructions}
              onChange={e => setAgent('instructions', e.target.value)}
              placeholder="Research the topic and produce a structured summary…" />
          </div>

          {/* Context mode */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Context Mode</label>
            <select className={cls} value={node.context_mode}
              onChange={e => onChange({ ...node, context_mode: e.target.value })}>
              <option value="scoped">scoped — receives only mapped input keys</option>
              <option value="shared">shared — receives full blackboard</option>
            </select>
          </div>

          {/* Input mapping */}
          {node.context_mode === 'scoped' && (
            <MappingEditor
              label="Input Mapping  (local_key → JSONPath)"
              mapping={node.input_mapping}
              onChange={m => onChange({ ...node, input_mapping: m })}
            />
          )}

          {/* Advanced toggle */}
          <button
            onClick={() => setAdvanced(a => !a)}
            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 self-start"
          >
            {advanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            Advanced options
          </button>

          {advanced && (
            <div className="flex flex-col gap-3 pl-2 border-l border-slate-700">
              {/* Temperature / max_tokens */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Temperature</label>
                  <input type="number" step="0.1" min="0" max="2"
                    className={cls}
                    value={node.agent.model.temperature ?? ''}
                    onChange={e => setModel('temperature', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="default" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Max Tokens</label>
                  <input type="number" min="1"
                    className={cls}
                    value={node.agent.model.max_tokens ?? ''}
                    onChange={e => setModel('max_tokens', e.target.value === '' ? null : parseInt(e.target.value))}
                    placeholder="default" />
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Description</label>
                <input className={cls}
                  value={node.agent.description || ''}
                  onChange={e => setAgent('description', e.target.value)}
                  placeholder="Used by LLM-as-router context" />
              </div>

              {/* Error policy */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Error Policy</label>
                <select className={cls}
                  value={node.error_policy?.policy || 'global'}
                  onChange={e => {
                    const v = e.target.value
                    onChange({
                      ...node,
                      error_policy: v === 'global' ? null : {
                        policy: v,
                        max_attempts: 3,
                        backoff: 'exponential',
                        backoff_base_seconds: 1,
                      },
                    })
                  }}>
                  <option value="global">inherit global default</option>
                  <option value="fail">fail</option>
                  <option value="retry">retry</option>
                  <option value="skip">skip</option>
                  <option value="fallback">fallback</option>
                </select>
              </div>
              {node.error_policy?.policy === 'retry' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400">Max Attempts</label>
                    <input type="number" min="1" max="10" className={cls}
                      value={node.error_policy.max_attempts}
                      onChange={e => onChange({ ...node, error_policy: { ...node.error_policy, max_attempts: parseInt(e.target.value) } })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400">Backoff</label>
                    <select className={cls}
                      value={node.error_policy.backoff}
                      onChange={e => onChange({ ...node, error_policy: { ...node.error_policy, backoff: e.target.value } })}>
                      <option value="none">none</option>
                      <option value="linear">linear</option>
                      <option value="exponential">exponential</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function NodeBuilder({ nodes, setNodes }) {
  const add    = ()         => setNodes(prev => [...prev, blankNode()])
  const remove = (idx)      => setNodes(prev => prev.filter((_, i) => i !== idx))
  const update = (idx, node) => setNodes(prev => prev.map((n, i) => i === idx ? node : n))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Nodes <span className="text-slate-500 font-normal">({nodes.length})</span>
        </h2>
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/30 transition-colors"
        >
          <Plus size={12} /> Add Node
        </button>
      </div>

      {nodes.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-xs border border-dashed border-slate-700 rounded-lg">
          No nodes yet.<br />Click "Add Node" to start building.
        </div>
      )}

      {nodes.map((node, i) => (
        <NodeCard
          key={i}
          index={i}
          node={node}
          onChange={(n) => update(i, n)}
          onDelete={() => remove(i)}
        />
      ))}
    </div>
  )
}
