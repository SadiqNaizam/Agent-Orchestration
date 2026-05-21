import { useState } from 'react'
import { UserCheck, Loader } from 'lucide-react'

/**
 * HitlPanel — shown inline in the event stream when the pipeline pauses
 * for human input. Submits text input to the backend HITL resume endpoint.
 *
 * Props:
 *   pause       { node_id, prompt, job_id }
 *   backendUrl  string
 *   onResume    () => void   — called after successful submission
 */
export default function HitlPanel({ pause, backendUrl, onResume }) {
  const [input,       setInput]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState(null)

  const handleSubmit = async () => {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${backendUrl}/api/jobs/${pause.job_id}/hitl`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input: { text: input.trim() } }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }
      onResume()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
  }

  return (
    <div className="mx-3 mb-3 border border-amber-500/40 bg-amber-950/20 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-900/20 border-b border-amber-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <UserCheck size={12} className="text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-300">Human Input Required</span>
        <span className="text-xs text-slate-500 font-mono ml-1 truncate">· {pause.node_id}</span>
      </div>

      {/* Prompt */}
      <div className="px-3 py-2.5">
        <p className="text-xs text-slate-300 leading-relaxed mb-3 whitespace-pre-wrap">
          {pause.prompt}
        </p>

        {/* Input */}
        <textarea
          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-200
                     font-mono resize-none focus:outline-none focus:border-amber-500/60 transition-colors
                     placeholder:text-slate-600"
          rows={3}
          placeholder="Type your input here… (Cmd/Ctrl+Enter to submit)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          autoFocus
        />

        {/* Error */}
        {error && (
          <p className="mt-1.5 text-xs text-red-400">Error: {error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-600">
            Pipeline is paused — submit to continue
          </span>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
                       bg-amber-600/30 text-amber-300 border border-amber-500/40
                       hover:bg-amber-600/40 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? <><Loader size={11} className="animate-spin" /> Resuming…</>
              : <><UserCheck size={11} /> Submit & Resume</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
