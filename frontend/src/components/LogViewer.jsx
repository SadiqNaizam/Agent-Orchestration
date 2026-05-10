import { useEffect, useRef } from 'react'
import { Trash2, Download } from 'lucide-react'

const TYPE_STYLES = {
  info:    'text-slate-300',
  success: 'text-green-400',
  warning: 'text-amber-400',
  error:   'text-red-400',
  result:  'text-indigo-300 font-semibold',
  log:     'text-slate-400',
  done:    'text-slate-600',
}

const TYPE_PREFIX = {
  info:    '',
  success: '',
  warning: '',
  error:   '',
  result:  '',
  log:     '',
  done:    '',
}

function LogLine({ entry, index }) {
  const cls = TYPE_STYLES[entry.type] || 'text-slate-400'
  const lines = entry.message.split('\n')

  return (
    <div className="group flex gap-3 px-4 py-0.5 hover:bg-slate-800/40 transition-colors">
      <span className="text-slate-700 text-xs select-none w-6 shrink-0 text-right pt-px">
        {index + 1}
      </span>
      <div className={`text-xs font-mono leading-relaxed ${cls} break-all whitespace-pre-wrap`}>
        {lines.map((line, i) => (
          <div key={i}>{line || ' '}</div>
        ))}
      </div>
    </div>
  )
}

export default function LogViewer({ logs, isRunning, onClear }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const handleDownload = () => {
    const text = logs.map(l => l.message).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orchestration-logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-xs text-slate-500">
            {logs.length} lines
            {isRunning && ' · streaming…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={logs.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30"
          >
            <Download size={11} /> Save
          </button>
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
          >
            <Trash2 size={11} /> Clear
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto log-scroll bg-slate-950 py-2"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-700">
            <div className="text-4xl">▶</div>
            <p className="text-xs">Press "Run Crew" to start execution</p>
          </div>
        ) : (
          <>
            {logs.filter(l => l.type !== 'done').map((entry, i) => (
              <LogLine key={i} entry={entry} index={i} />
            ))}
            <div ref={bottomRef} className="h-4" />
          </>
        )}
      </div>
    </div>
  )
}
