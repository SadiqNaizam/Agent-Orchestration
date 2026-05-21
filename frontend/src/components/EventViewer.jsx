import { useEffect, useMemo, useRef } from 'react'
import { Trash2, Download } from 'lucide-react'
import HitlPanel from './HitlPanel'

// ── Display entry derivation ───────────────────────────────────────────────────
//
// We convert the raw events array into an ordered list of "display entries":
//   { type: 'node_block', nodeId, agentId, contextMode, inputKeys, content, status, tokens, duration }
//   { type: 'event_line', event }
//
// Consecutive chunks for the same node accumulate into one node_block.

function deriveEntries(events) {
  const entries   = []
  const nodeIndex = {}   // nodeId → index of its node_block in entries

  for (const ev of events) {
    const t = ev.event_type

    if (t === 'node_start') {
      const block = {
        type:        'node_block',
        nodeId:      ev.node_id,
        agentId:     ev.payload?.agent_id,
        contextMode: ev.payload?.context_mode,
        inputKeys:   ev.payload?.input_keys || [],
        content:     '',
        status:      'running',
        tokens:      null,
        duration:    null,
        timestamp:   ev.timestamp,
      }
      nodeIndex[ev.node_id] = entries.length
      entries.push(block)

    } else if (t === 'chunk') {
      const idx = nodeIndex[ev.node_id]
      if (idx !== undefined) {
        entries[idx] = {
          ...entries[idx],
          content: entries[idx].content + (ev.payload?.content || ''),
        }
      }

    } else if (t === 'node_complete') {
      const idx = nodeIndex[ev.node_id]
      if (idx !== undefined) {
        entries[idx] = {
          ...entries[idx],
          status:   'complete',
          tokens:   ev.payload?.token_usage,
          duration: ev.payload?.duration_ms,
        }
      }

    } else {
      // Everything else: routing_decision, loop_iteration, compaction_event,
      // error, orchestration_complete, plus synthetic "info" entries.
      entries.push({ type: 'event_line', event: ev })
    }
  }

  return entries
}

// ── Individual renderers ────────────────────────────────────────────────────────

function NodeBlock({ block }) {
  const isRunning = block.status === 'running'

  return (
    <div className="border border-slate-700/60 rounded-lg overflow-hidden mb-3">
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 ${isRunning ? 'bg-indigo-900/30' : 'bg-slate-800/60'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-green-600'}`} />
          <span className="text-xs font-semibold text-indigo-300 font-mono">{block.nodeId}</span>
          {block.agentId && block.agentId !== block.nodeId && (
            <span className="text-xs text-slate-500">({block.agentId})</span>
          )}
          <span className={`text-xs px-1 rounded ${
            block.contextMode === 'shared'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-slate-700 text-slate-400'
          }`}>{block.contextMode}</span>
          {block.inputKeys.length > 0 && (
            <span className="text-xs text-slate-600 truncate">
              keys: {block.inputKeys.join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
          {block.tokens && (
            <span>{block.tokens.total_tokens} tok</span>
          )}
          {block.duration && (
            <span>{block.duration < 1000 ? `${block.duration}ms` : `${(block.duration / 1000).toFixed(1)}s`}</span>
          )}
        </div>
      </div>

      {/* Content */}
      {block.content && (
        <div className="px-3 py-2.5 bg-slate-950/60">
          <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
            {block.content}
            {isRunning && (
              <span className="inline-block w-1.5 h-3 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
            )}
          </pre>
        </div>
      )}

      {!block.content && isRunning && (
        <div className="px-3 py-2 text-xs text-slate-600 italic">
          Waiting for output…
        </div>
      )}
    </div>
  )
}

function EventLine({ event }) {
  const t   = event.event_type
  const p   = event.payload || {}
  const seq = event.sequence

  let icon, text, cls

  switch (t) {
    case 'routing_decision':
      icon = '→'
      text = `${event.node_id} → ${p.selected_node}  [${p.routing_type}]`
      if (p.condition_expression) text += `  ·  ${p.condition_expression}`
      cls  = 'text-violet-300'
      break

    case 'loop_iteration':
      icon = '↻'
      text = `${p.loop_id}  iteration ${p.iteration}/${p.max_iterations}`
      if (p.exit_condition_met) text += '  ·  exit condition met'
      cls  = 'text-amber-300'
      break

    case 'compaction_event':
      icon = '⊃'
      text = `COMPACTION  ${p.tokens_before}→${p.tokens_after} tokens  ·  ${(p.keys_compacted || []).length} keys`
      cls  = 'text-cyan-300'
      break

    case 'error':
      icon = '✗'
      text = `[${event.node_id || '?'}] ${p.error_type}: ${p.message}  ·  policy: ${p.policy_applied}`
      if (p.attempt_number) text += `  ·  attempt ${p.attempt_number}`
      cls  = 'text-red-400'
      break

    case 'orchestration_complete':
      icon = '■'
      text = `COMPLETE [${p.status}]  ·  ${p.nodes_executed} nodes  ·  ${(p.total_token_usage?.total_tokens || 0)} tokens  ·  ${p.total_duration_ms}ms`
      cls  = p.status === 'success' ? 'text-green-400' : 'text-amber-400'
      break

    case 'hitl_pause':
      icon = '⏸'
      text = `HITL PAUSE  [${event.node_id}]  · ${p.prompt?.slice(0, 80)}${(p.prompt?.length ?? 0) > 80 ? '…' : ''}`
      cls  = 'text-amber-400'
      break

    case 'hitl_resume':
      icon = '▶'
      text = `HITL RESUME  [${event.node_id}]  · input written to ${event.node_id}.${p.input_key}`
      cls  = 'text-green-400'
      break

    case 'info':
      icon = '·'
      text = p.message || ''
      cls  = 'text-slate-400'
      break

    default:
      icon = '·'
      text = `${t}: ${JSON.stringify(p)}`
      cls  = 'text-slate-500'
  }

  return (
    <div className={`flex gap-2 px-3 py-0.5 text-xs font-mono ${cls}`}>
      <span className="text-slate-600 w-5 shrink-0 text-right">{seq > 0 ? seq : ''}</span>
      <span className="shrink-0">{icon}</span>
      <span className="break-all">{text}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EventViewer({ events, isRunning, onClear, hitlPause, backendUrl, onHitlResume }) {
  const bottomRef = useRef(null)
  const entries   = useMemo(() => deriveEntries(events), [events])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const handleDownload = () => {
    const lines = events.map(ev => {
      const p = ev.payload || {}
      if (ev.event_type === 'chunk') return p.content || ''
      return `[${ev.event_type}] ${JSON.stringify(p)}`
    }).join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `orchestration-events-${Date.now()}.txt`
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
            {events.filter(e => e.event_type !== 'chunk' && e.event_type !== 'info').length} events
            {isRunning && ' · streaming…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={events.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30"
          >
            <Download size={11} /> Save
          </button>
          <button
            onClick={onClear}
            disabled={events.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
          >
            <Trash2 size={11} /> Clear
          </button>
        </div>
      </div>

      {/* Event stream */}
      <div className="flex-1 overflow-y-auto bg-slate-950 py-3">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-700">
            <div className="text-4xl">▶</div>
            <p className="text-xs">Press "Run" to start the orchestration</p>
          </div>
        ) : (
          <>
            {entries.map((entry, i) => (
              entry.type === 'node_block'
                ? <div key={i} className="px-3 mb-1"><NodeBlock block={entry} /></div>
                : <EventLine key={i} event={entry.event} />
            ))}
            {hitlPause && (
              <HitlPanel
                pause={hitlPause}
                backendUrl={backendUrl}
                onResume={onHitlResume}
              />
            )}
            <div ref={bottomRef} className="h-4" />
          </>
        )}
      </div>
    </div>
  )
}
