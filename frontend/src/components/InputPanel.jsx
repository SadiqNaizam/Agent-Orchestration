import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

const cls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 uppercase tracking-wider transition-colors"
      >
        {title}
        {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
      </button>
      {open && <div className="p-3 flex flex-col gap-3 bg-slate-900/50">{children}</div>}
    </div>
  )
}

// ── Compaction config ──────────────────────────────────────────────────────────
function CompactionConfig({ compaction, setCompaction }) {
  const enabled = compaction !== null && compaction !== undefined
  const cfg = compaction || {}

  const toggle = (on) => setCompaction(on ? {
    enabled: true,
    token_threshold: 6000,
    strategy: 'summarize_oldest',
    compaction_agent: {
      agent_id: 'compactor',
      system_prompt: 'You are a context compaction assistant. Summarise the provided conversation history concisely.',
      instructions: 'Summarise the key information from the context entries provided, preserving all critical details.',
      model: { provider: 'openai', model_name: 'gpt-4o-mini', temperature: 0.2, max_tokens: null },
    },
    preserve_keys: [],
    min_recency_window: 2,
  } : null)

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => toggle(e.target.checked)}
          className="accent-cyan-500"
        />
        <span className="text-xs text-slate-300">Enable context compaction</span>
      </label>

      {enabled && (
        <div className="flex flex-col gap-2 pl-2 border-l border-cyan-500/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Token Threshold</label>
              <input type="number" min="1000" max="100000" step="500" className={cls}
                value={cfg.token_threshold || 6000}
                onChange={e => setCompaction({ ...cfg, token_threshold: parseInt(e.target.value) })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Min Recency Window</label>
              <input type="number" min="1" max="20" className={cls}
                value={cfg.min_recency_window || 2}
                onChange={e => setCompaction({ ...cfg, min_recency_window: parseInt(e.target.value) })} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Strategy</label>
            <select className={cls} value={cfg.strategy || 'summarize_oldest'}
              onChange={e => setCompaction({ ...cfg, strategy: e.target.value })}>
              <option value="summarize_oldest">summarize_oldest</option>
              <option value="drop_oldest">drop_oldest</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Preserve Keys (comma-separated)</label>
            <input className={`${cls} font-mono`}
              value={(cfg.preserve_keys || []).join(', ')}
              onChange={e => setCompaction({
                ...cfg,
                preserve_keys: e.target.value.split(',').map(k => k.trim()).filter(Boolean),
              })}
              placeholder="important_key, another_key" />
            <p className="text-xs text-slate-600">Keys that will never be compacted.</p>
          </div>

          <div className="border-t border-slate-700/60 pt-2">
            <p className="text-xs text-slate-400 font-medium mb-2">Compaction Agent</p>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Provider</label>
                  <select className={cls}
                    value={cfg.compaction_agent?.model?.provider || 'openai'}
                    onChange={e => setCompaction({
                      ...cfg,
                      compaction_agent: {
                        ...cfg.compaction_agent,
                        model: { ...cfg.compaction_agent?.model, provider: e.target.value },
                      },
                    })}>
                    {['openai', 'azure', 'anthropic', 'google', 'cohere'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Model</label>
                  <input className={cls}
                    value={cfg.compaction_agent?.model?.model_name || 'gpt-4o-mini'}
                    onChange={e => setCompaction({
                      ...cfg,
                      compaction_agent: {
                        ...cfg.compaction_agent,
                        model: { ...cfg.compaction_agent?.model, model_name: e.target.value },
                      },
                    })}
                    placeholder="gpt-4o-mini" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Global error policy ────────────────────────────────────────────────────────
const POLICIES = ['fail', 'retry', 'skip', 'fallback']

function ErrorPolicyConfig({ errorPolicy, setErrorPolicy }) {
  const enabled = errorPolicy !== null && errorPolicy !== undefined
  const pol = errorPolicy || {}

  const toggle = (on) => setErrorPolicy(on ? {
    default_policy: 'fail',
    max_retries: 3,
    retry_delay_seconds: 1.0,
    retry_backoff: 'exponential',
    fallback_node: null,
  } : null)

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => toggle(e.target.checked)}
          className="accent-orange-500"
        />
        <span className="text-xs text-slate-300">Configure global error policy</span>
      </label>
      <p className="text-xs text-slate-600 -mt-2">Default policy is "fail" if not configured.</p>

      {enabled && (
        <div className="flex flex-col gap-2 pl-2 border-l border-orange-500/30">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Default Policy</label>
            <select className={cls} value={pol.default_policy || 'fail'}
              onChange={e => setErrorPolicy({ ...pol, default_policy: e.target.value })}>
              {POLICIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {(pol.default_policy === 'retry') && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Max Retries</label>
                  <input type="number" min="1" max="10" className={cls}
                    value={pol.max_retries || 3}
                    onChange={e => setErrorPolicy({ ...pol, max_retries: parseInt(e.target.value) })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Retry Delay (s)</label>
                  <input type="number" min="0" max="60" step="0.5" className={cls}
                    value={pol.retry_delay_seconds || 1.0}
                    onChange={e => setErrorPolicy({ ...pol, retry_delay_seconds: parseFloat(e.target.value) })} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Backoff Strategy</label>
                <select className={cls} value={pol.retry_backoff || 'exponential'}
                  onChange={e => setErrorPolicy({ ...pol, retry_backoff: e.target.value })}>
                  <option value="linear">linear</option>
                  <option value="exponential">exponential</option>
                </select>
              </div>
            </>
          )}

          {pol.default_policy === 'fallback' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Fallback Node ID</label>
              <input className={`${cls} font-mono`}
                value={pol.fallback_node || ''}
                onChange={e => setErrorPolicy({ ...pol, fallback_node: e.target.value || null })}
                placeholder="error_handler" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Streaming config ───────────────────────────────────────────────────────────
function StreamingConfig({ streaming, setStreaming }) {
  const cfg = streaming || { chunk_size_chars: 200, provenance_enabled: false }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Chunk Size (chars)</label>
        <input type="number" min="50" max="2000" step="50" className={cls}
          value={cfg.chunk_size_chars || 200}
          onChange={e => setStreaming({ ...cfg, chunk_size_chars: parseInt(e.target.value) })} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={cfg.provenance_enabled || false}
          onChange={e => setStreaming({ ...cfg, provenance_enabled: e.target.checked })}
          className="accent-indigo-500"
        />
        <span className="text-xs text-slate-300">Enable provenance tracking</span>
      </label>
      <p className="text-xs text-slate-600">Provenance attaches a node chain to each chunk event.</p>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function InputPanel({
  input, setInput, orchestrationId, setOrchestrationId,
  compaction, setCompaction, errorPolicy, setErrorPolicy,
  streaming, setStreaming,
}) {
  const [raw, setRaw]   = useState(JSON.stringify(input, null, 2))
  const [error, setErr] = useState(null)

  const handleJsonChange = (text) => {
    setRaw(text)
    try {
      const parsed = JSON.parse(text)
      setInput(parsed)
      setErr(null)
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
        Run Configuration
      </h2>

      {/* Orchestration ID */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Orchestration ID</label>
        <input
          className={cls}
          value={orchestrationId}
          onChange={e => setOrchestrationId(e.target.value)}
          placeholder="orch-001"
        />
        <p className="text-xs text-slate-600">Appears in every streaming event envelope.</p>
      </div>

      {/* Input data */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">
          Input Data <span className="text-slate-600">(JSON)</span>
        </label>
        <textarea
          className={`${cls} font-mono leading-relaxed resize-none`}
          rows={10}
          value={raw}
          onChange={e => handleJsonChange(e.target.value)}
          spellCheck={false}
        />
        {error && (
          <div className="flex gap-2 items-start p-2 rounded bg-red-500/10 border border-red-500/30">
            <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}
        <p className="text-xs text-slate-600">
          Accessible in nodes via <code className="text-indigo-400">$.input.*</code> JSONPath expressions.
        </p>
      </div>

      {/* Quick reference */}
      <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
        <p className="text-xs text-slate-400 font-medium mb-2">JSONPath quick reference</p>
        <div className="flex flex-col gap-1 font-mono">
          {[
            ['$.input.topic',               'top-level input field'],
            ['$.researcher.output',          'full output of "researcher" node'],
            ['$.researcher.output.content',  'text content from researcher'],
            ['$.input.audience',             'another input field'],
          ].map(([path, desc]) => (
            <div key={path} className="flex gap-2 items-baseline">
              <code className="text-indigo-300 text-xs shrink-0">{path}</code>
              <span className="text-slate-600 text-xs">→ {desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible advanced sections */}
      <Section title="Streaming">
        <StreamingConfig streaming={streaming} setStreaming={setStreaming} />
      </Section>

      <Section title="Compaction">
        <CompactionConfig compaction={compaction} setCompaction={setCompaction} />
      </Section>

      <Section title="Error Policy">
        <ErrorPolicyConfig errorPolicy={errorPolicy} setErrorPolicy={setErrorPolicy} />
      </Section>
    </div>
  )
}
