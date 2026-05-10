import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Plus, Trash2, Zap, MessageSquare } from 'lucide-react'

// ── Individual message bubble ──────────────────────────────────────────────────
function Bubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-4 mb-3`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
        isUser
          ? 'bg-indigo-600 text-white rounded-br-sm'
          : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-sm'
      }`}>
        <pre className="whitespace-pre-wrap font-sans">{content}</pre>
      </div>
    </div>
  )
}

// ── Streaming bubble (live cursor) ─────────────────────────────────────────────
function StreamingBubble({ content }) {
  return (
    <div className="flex justify-start px-4 mb-3">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs leading-relaxed bg-slate-800 border border-slate-700 text-slate-200">
        <pre className="whitespace-pre-wrap font-sans">
          {content || ''}
          <span className="inline-block w-1.5 h-3 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
        </pre>
      </div>
    </div>
  )
}

// ── Compaction divider ─────────────────────────────────────────────────────────
function CompactionDivider({ tokensBefore, tokensAfter }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 my-1">
      <div className="flex-1 h-px bg-cyan-800/40" />
      <span className="flex items-center gap-1 text-xs text-cyan-600 shrink-0">
        <Zap size={10} />
        Context compacted · {tokensBefore} → {tokensAfter} tokens
      </span>
      <div className="flex-1 h-px bg-cyan-800/40" />
    </div>
  )
}

// ── Session sidebar item ───────────────────────────────────────────────────────
function SessionItem({ session, active, onClick, onDelete }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer group transition-colors ${
        active ? 'bg-indigo-600/20 border border-indigo-600/30' : 'hover:bg-slate-800 border border-transparent'
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-300 truncate">
          {session.agent_name || session.agent_id}
        </p>
        <p className="text-xs text-slate-600">
          {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ── Main ChatPanel ─────────────────────────────────────────────────────────────
export default function ChatPanel({
  config, apiKey, apiKeyType, azureEndpoint, azureApiVersion, backendUrl,
}) {
  const agents = (config.nodes || []).map(n => n.agent).filter(a => a?.agent_id)

  // Sessions
  const [sessions, setSessions]         = useState([])
  const [activeId,  setActiveId]        = useState(null)
  const [selectedAgent, setSelectedAgent] = useState(0)

  // Per-session message history stored in frontend state
  // { [session_id]: [{role, content} | {type:'compaction', tokensBefore, tokensAfter}] }
  const [msgMap, setMsgMap]             = useState({})

  // Streaming state
  const [streamingContent, setStreamingContent] = useState(null) // null = idle
  const streamRef = useRef('')       // accumulates during streaming without re-render lag

  const [isStreaming, setIsStreaming]   = useState(false)
  const [userInput, setUserInput]       = useState('')
  const [error, setError]               = useState(null)

  const esRef     = useRef(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  const messages = msgMap[activeId] || []

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // ── Create session ───────────────────────────────────────────────────────────
  const createSession = useCallback(async () => {
    if (!agents.length) return
    const agent = agents[selectedAgent] || agents[0]
    setError(null)
    try {
      const res = await fetch(`${backendUrl}/chat/session`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          agent,
          compaction:       config.compaction  || null,
          api_key:          apiKey             || undefined,
          api_key_type:     apiKeyType,
          azure_endpoint:   azureEndpoint      || undefined,
          azure_api_version: azureApiVersion,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText)
      const { session_id } = await res.json()
      const info = {
        session_id,
        agent_id:      agent.agent_id,
        agent_name:    agent.name || agent.agent_id,
        message_count: 0,
      }
      setSessions(prev => [info, ...prev])
      setActiveId(session_id)
      setMsgMap(prev => ({ ...prev, [session_id]: [] }))
      inputRef.current?.focus()
    } catch (e) {
      setError(e.message)
    }
  }, [agents, selectedAgent, config, apiKey, apiKeyType, azureEndpoint, azureApiVersion, backendUrl])

  // ── Delete session ───────────────────────────────────────────────────────────
  const deleteSession = useCallback(async (session_id) => {
    await fetch(`${backendUrl}/chat/session/${session_id}`, { method: 'DELETE' }).catch(() => {})
    setSessions(prev => prev.filter(s => s.session_id !== session_id))
    setMsgMap(prev => { const n = { ...prev }; delete n[session_id]; return n })
    if (activeId === session_id) {
      setActiveId(null)
      setStreamingContent(null)
    }
  }, [activeId, backendUrl])

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const content = userInput.trim()
    if (!content || isStreaming || !activeId) return
    setUserInput('')
    setError(null)

    // Optimistically append user bubble
    setMsgMap(prev => ({
      ...prev,
      [activeId]: [...(prev[activeId] || []), { role: 'user', content }],
    }))
    setSessions(prev =>
      prev.map(s => s.session_id === activeId ? { ...s, message_count: s.message_count + 1 } : s)
    )

    streamRef.current = ''
    setStreamingContent('')
    setIsStreaming(true)

    try {
      const res = await fetch(`${backendUrl}/chat/session/${activeId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText)
      const { job_id } = await res.json()

      const es = new EventSource(`${backendUrl}/api/stream/${job_id}`)
      esRef.current = es

      es.onmessage = (evt) => {
        const item = JSON.parse(evt.data)

        if (item.type === 'done') {
          es.close()
          esRef.current = null
          const final = streamRef.current
          setMsgMap(prev => ({
            ...prev,
            [activeId]: [...(prev[activeId] || []), { role: 'assistant', content: final }],
          }))
          setSessions(prev =>
            prev.map(s => s.session_id === activeId ? { ...s, message_count: s.message_count + 1 } : s)
          )
          streamRef.current = ''
          setStreamingContent(null)
          setIsStreaming(false)
          inputRef.current?.focus()
          return
        }

        if (item.type !== 'event') return
        const ev = item.data

        if (ev.event_type === 'chunk') {
          streamRef.current += (ev.payload?.content || '')
          setStreamingContent(streamRef.current)
        } else if (ev.event_type === 'compaction_event') {
          setMsgMap(prev => ({
            ...prev,
            [activeId]: [...(prev[activeId] || []), {
              type:         'compaction',
              tokensBefore: ev.payload.tokens_before,
              tokensAfter:  ev.payload.tokens_after,
            }],
          }))
        } else if (ev.event_type === 'error') {
          setError(ev.payload?.message || 'Unknown error')
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setStreamingContent(null)
        setIsStreaming(false)
        setError('Connection lost')
      }

    } catch (e) {
      setError(e.message)
      setStreamingContent(null)
      setIsStreaming(false)
    }
  }, [userInput, isStreaming, activeId, backendUrl])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Empty states ─────────────────────────────────────────────────────────────
  if (!agents.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
        <MessageSquare size={32} strokeWidth={1} />
        <p className="text-xs text-center">
          Add at least one node in the <span className="text-slate-400">Nodes</span> tab,<br />
          then come back here to start chatting.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Session sidebar ── */}
      <div className="flex flex-col w-48 shrink-0 border-r border-slate-800 bg-slate-900">
        {/* Agent selector + new session */}
        <div className="p-3 border-b border-slate-800 flex flex-col gap-2">
          <select
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"
            value={selectedAgent}
            onChange={e => setSelectedAgent(parseInt(e.target.value))}
          >
            {agents.map((a, i) => (
              <option key={i} value={i}>{a.name || a.agent_id}</option>
            ))}
          </select>
          <button
            onClick={createSession}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/30 transition-colors"
          >
            <Plus size={12} /> New Chat
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-700 text-center mt-4">No sessions yet</p>
          ) : (
            sessions.map(s => (
              <SessionItem
                key={s.session_id}
                session={s}
                active={s.session_id === activeId}
                onClick={() => setActiveId(s.session_id)}
                onDelete={() => deleteSession(s.session_id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {!activeId ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-600">
            <MessageSquare size={32} strokeWidth={1} />
            <p className="text-xs">Select a session or create a new one.</p>
          </div>
        ) : (
          <>
            {/* Message thread */}
            <div className="flex-1 overflow-y-auto bg-slate-950 py-4">
              {messages.length === 0 && streamingContent === null && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-700">
                  <p className="text-xs">Send a message to start the conversation.</p>
                </div>
              )}

              {messages.map((msg, i) => {
                if (msg.type === 'compaction') {
                  return (
                    <CompactionDivider
                      key={i}
                      tokensBefore={msg.tokensBefore}
                      tokensAfter={msg.tokensAfter}
                    />
                  )
                }
                return <Bubble key={i} role={msg.role} content={msg.content} />
              })}

              {streamingContent !== null && (
                <StreamingBubble content={streamingContent} />
              )}

              {error && (
                <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div ref={bottomRef} className="h-2" />
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-slate-800 bg-slate-900 px-3 py-3 flex gap-2 items-end">
              <textarea
                ref={inputRef}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 transition-colors resize-none leading-relaxed max-h-32"
                rows={1}
                placeholder="Message… (Enter to send, Shift+Enter for newline)"
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
              />
              <button
                onClick={sendMessage}
                disabled={!userInput.trim() || isStreaming}
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
