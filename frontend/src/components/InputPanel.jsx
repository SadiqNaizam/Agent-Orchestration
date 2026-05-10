import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function InputPanel({ input, setInput, orchestrationId, setOrchestrationId }) {
  const [raw, setRaw]   = useState(JSON.stringify(input, null, 2))
  const [error, setErr] = useState(null)

  const cls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"

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
        <p className="text-xs text-slate-600">
          Appears in every streaming event envelope.
        </p>
      </div>

      {/* Input data */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">
          Input Data <span className="text-slate-600">(JSON)</span>
        </label>
        <textarea
          className={`${cls} font-mono leading-relaxed resize-none`}
          rows={12}
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
            ['$.input.topic',            'top-level input field'],
            ['$.researcher.output',      'full output of "researcher" node'],
            ['$.researcher.output.content', 'text content from researcher'],
            ['$.input.audience',         'another input field'],
          ].map(([path, desc]) => (
            <div key={path} className="flex gap-2 items-baseline">
              <code className="text-indigo-300 text-xs shrink-0">{path}</code>
              <span className="text-slate-600 text-xs">→ {desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
