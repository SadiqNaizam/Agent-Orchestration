/**
 * ProcessChat — right-panel chat interface for the main Pensieve agent.
 *
 * Handles:
 *  • Displaying message history (user right-aligned, assistant left-aligned)
 *  • Streaming assistant tokens (chat_chunk events accumulate into a live bubble)
 *  • Gate cards: selection (amber), review (blue), approval/complete (green)
 *  • Approve button → POST /api/pensieve/{runId}/approve
 *  • Sending user messages → POST /api/pensieve/{runId}/message
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, CheckCircle, AlertCircle, Eye, Loader2 } from 'lucide-react'

// ── Simple markdown renderer (bold + code only) ────────────────────────────────
function renderMarkdown(text) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded text-indigo-300">{part.slice(1, -1)}</code>
    if (part === '\n')
      return <br key={i} />
    return part
  })
}

// ── Gate card ─────────────────────────────────────────────────────────────────
function GateCard({ gate, onApprove, onSendFeedback, isApproving }) {
  const [feedback, setFeedback] = useState('')

  if (!gate) return null

  const isSelection = gate.gate_type === 'selection'
  const isApproval  = gate.gate_type === 'approval'

  const cardStyle = isSelection
    ? 'border-amber-500/40 bg-amber-500/10'
    : isApproval
    ? 'border-green-500/40 bg-green-500/10'
    : 'border-blue-500/40 bg-blue-500/10'

  const Icon = isSelection ? AlertCircle : isApproval ? CheckCircle : Eye
  const iconColor = isSelection ? 'text-amber-400' : isApproval ? 'text-green-400' : 'text-blue-400'
  const label = isSelection ? 'Make a Selection' : isApproval ? 'Process Complete' : 'Review Required'

  return (
    <div className={`mx-3 mb-3 rounded-lg border p-3 ${cardStyle}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={iconColor} />
        <span className={`text-xs font-semibold ${iconColor}`}>{label}</span>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed mb-3">{gate.prompt}</p>

      {isSelection && (
        <p className="text-xs text-amber-400/70 italic">
          Select an option from the panel on the left, then the process will continue.
        </p>
      )}

      {!isSelection && (
        <div className="flex flex-col gap-2">
          {!isApproval && (
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Optional: describe what you'd like changed…"
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 resize-none focus:outline-none focus:border-indigo-500"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(true, feedback)}
              disabled={isApproving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors
                ${isApproval
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                } disabled:opacity-50`}
            >
              {isApproving
                ? <><Loader2 size={12} className="animate-spin" /> Processing…</>
                : isApproval ? <><CheckCircle size={12} /> Finish</> : <><CheckCircle size={12} /> Approve</>
              }
            </button>
            {!isApproval && feedback && (
              <button
                onClick={() => { onSendFeedback(feedback); setFeedback('') }}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                Request Changes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-1">
        <span className="text-xs text-slate-600 italic">{msg.content}</span>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-3 mb-2`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed
          ${isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
          }`}
      >
        {renderMarkdown(msg.content)}
        {isStreaming && (
          <span className="inline-block w-1.5 h-3 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  )
}

// ── Thinking indicator ─────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div className="flex justify-start px-3 mb-2">
      <div className="bg-slate-800 border border-slate-700 rounded-xl rounded-bl-sm px-3 py-2.5">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ProcessChat({
  runId,
  backendUrl,
  messages,
  isThinking,
  streamingContent,
  gate,
  onGateApprove,
}) {
  const [input, setInput]           = useState('')
  const [isSending, setIsSending]   = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, isThinking, gate])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !runId) return
    setIsSending(true)
    try {
      await fetch(`${backendUrl}/api/pensieve/${runId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: text.trim() }),
      })
    } finally {
      setIsSending(false)
    }
  }, [runId, backendUrl])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
  }, [input, sendMessage])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApprove = useCallback(async (approved, feedback) => {
    setIsApproving(true)
    try {
      await fetch(`${backendUrl}/api/pensieve/${runId}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ approved, feedback }),
      })
      if (onGateApprove) onGateApprove()
    } finally {
      setIsApproving(false)
    }
  }, [runId, backendUrl, onGateApprove])

  const handleFeedback = useCallback((text) => {
    sendMessage(text)
    if (onGateApprove) onGateApprove()
  }, [sendMessage, onGateApprove])

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 shrink-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Design Agent</p>
        {runId && (
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">{runId.slice(0, 8)}…</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {messages.length === 0 && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-700">
            <div className="text-3xl">✦</div>
            <p className="text-xs">Start a process run to begin</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            isStreaming={false}
          />
        ))}

        {/* Live streaming bubble */}
        {streamingContent && (
          <MessageBubble
            msg={{ role: 'assistant', content: streamingContent }}
            isStreaming={true}
          />
        )}

        {/* Thinking indicator (between stream chunks) */}
        {isThinking && !streamingContent && <ThinkingDots />}

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Gate card */}
      {gate && (
        <GateCard
          gate={gate}
          onApprove={handleApprove}
          onSendFeedback={handleFeedback}
          isApproving={isApproving}
        />
      )}

      {/* Input */}
      <div className="border-t border-slate-800 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={gate ? 'Ask a question or request changes…' : 'Type a message…'}
            rows={2}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending || !runId}
            className="flex items-center justify-center w-9 h-9 self-end rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isSending
              ? <Loader2 size={14} className="text-white animate-spin" />
              : <Send size={14} className="text-white" />
            }
          </button>
        </div>
        <p className="text-[10px] text-slate-700 mt-1.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
