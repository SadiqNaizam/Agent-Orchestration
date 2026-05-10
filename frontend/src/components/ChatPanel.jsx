import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Plus, Trash2, Zap, MessageSquare, Bot } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function sessionName(idx) { return `Chat ${idx + 1}` }

// ── Bubble components ──────────────────────────────────────────────────────────

function UserBubble({ content }) {
  return (
    <div className="flex justify-end px-4 mb-3">
      <div className="max-w-[78%] rounded-2xl rounded-br-sm px-3.5 py-2.5 bg-indigo-600 text-white text-xs leading-relaxed">
        <pre className="whitespace-pre-wrap font-sans">{content}</pre>
      </div>
    </div>
  )
}

function AssistantBubble({ content }) {
  return (
    <div className="flex justify-start px-4 mb-3">
      <div className="max-w-[78%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs leading-relaxed">
        <pre className="whitespace-pre-wrap font-sans">{content}</pre>
      </div>
    </div>
  )
}

function StreamingBubble({ content }) {
  return (
    <div className="flex justify-start px-4 mb-3">
      <div className="max-w-[78%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs leading-relaxed">
        <pre className="whitespace-pre-wrap font-sans">
          {content}
          <span className="inline-block w-1.5 h-3 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
        </pre>
      </div>
    </div>
  )
}

function NodeLabel({ agentId }) {
  return (
    <div className="flex justify-start px-4 mb-1">
      <span className="flex items-center gap-1 text-xs text-indigo-400/70 font-mono">
        <Bot size={10} /> {agentId}
      </span>
    </div>
  )
}

function CompactionDivider({ tokensBefore, tokensAfter }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 my-1">
      <div className="flex-1 h-px bg-cyan-800/40" />
      <span className="flex items-center gap-1 text-xs text-cyan-600 shrink-0">
        <Zap size={10} />
        Context compacted · {tokensBefore} → {tokensAfter} tok
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
        active
          ? 'bg-indigo-600/20 border border-indigo-600/30'
          : 'hover:bg-slate-800 border border-transparent'
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-300 truncate">{session.name}</p>
        <p className="text-xs text-slate-600">{session.turnCount} turn{session.turnCount !== 1 ? 's' : ''}</p>
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChatPanel({
  config, apiKey, apiKeyType, azureEndpoint, azureApiVersion, backendUrl,
}) {
  const hasOrchestration = (config.nodes?.length > 0) || (config.presets?.length > 0)

  // Sessions: pure local state — no server call needed
  // session: { id, name, turnCount, messages: [{role, content}|{type:'node_label',agentId}|{type:'compaction',...}] }
  const [sessions, setSessions]         = useState([])
  const [activeId, setActiveId]         = useState(null)

  // Streaming
  const [streamingContent, setStreamingContent] = useState(null) // null = idle
  const streamRef    = useRef('')
  const currentNode  = useRef(null)   // tracks current streaming node for labels

  const [isStreaming, setIsStreaming]   = useState(false)
  const [userInput, setUserInput]       = useState('')
  const [error, setError]               = useState(null)

  const esRef     = useRef(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  const activeSession = sessions.find(s => s.id === activeId)
  const messages      = activeSession?.messages || []

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const updateSession = useCallback((id, fn) => {
    setSessions(prev => prev.map(s => s.id === id ? fn(s) : s))
  }, [])

  // ── Create session (local only — no server call) ─────────────────────────────
  const createSession = useCallback(() => {
    const id  = `chat-${Date.now()}`
    const name = sessionName(sessions.length)
    setSessions(prev => [{ id, name, turnCount: 0, messages: [] }, ...prev])
    setActiveId(id)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [sessions.length])

  // ── Delete session ───────────────────────────────────────────────────────────
  const deleteSession = useCallback((id) => {
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeId === id) {
      setActiveId(null)
      setStreamingContent(null)
    }
  }, [activeId])

  // ── Send message → run full orchestration ────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const content = userInput.trim()
    if (!content || isStreaming || !activeId) return

    setUserInput('')
    setError(null)

    // Snapshot current history for context injection
    const history = (activeSession?.messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    // Add user message to thread
    updateSession(activeId, s => ({
      ...s,
      turnCount: s.turnCount + 1,
      messages:  [...s.messages, { role: 'user', content }],
    }))

    // Build orchestration payload — inject message + history into input
    const payload = {
      ...config,
      input: {
        ...(config.input || {}),
        message:              content,
        conversation_history: history,
      },
      api_key:           apiKey       || undefined,
      api_key_type:      apiKeyType,
      ...(apiKeyType === 'azure' && azureEndpoint
        ? { azure_endpoint: azureEndpoint, azure_api_version: azureApiVersion }
        : {}),
    }

    streamRef.current  = ''
    currentNode.current = null
    setStreamingContent('')
    setIsStreaming(true)

    try {
      const res = await fetch(`${backendUrl}/api/orchestrate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }
      const { job_id } = await res.json()

      const es = new EventSource(`${backendUrl}/api/stream/${job_id}`)
      esRef.current = es

      es.onmessage = (evt) => {
        const item = JSON.parse(evt.data)

        if (item.type === 'done') {
          es.close()
          esRef.current = null
          const final = streamRef.current

          // Append completed assistant bubble
          updateSession(activeId, s => ({
            ...s,
            messages: [...s.messages, { role: 'assistant', content: final }],
          }))

          streamRef.current   = ''
          currentNode.current  = null
          setStreamingContent(null)
          setIsStreaming(false)
          setTimeout(() => inputRef.current?.focus(), 50)
          return
        }

        if (item.type !== 'event') return
        const ev = item.data

        if (ev.event_type === 'node_start') {
          // New agent starts — add a separator in the stream if needed
          const agentId = ev.payload?.agent_id || ev.node_id
          if (streamRef.current !== '') streamRef.current += '\n\n'
          streamRef.current   += `[${agentId}]\n`
          currentNode.current  = ev.node_id
          setStreamingContent(streamRef.current)

        } else if (ev.event_type === 'chunk') {
          streamRef.current += (ev.payload?.content || '')
          setStreamingContent(streamRef.current)

        } else if (ev.event_type === 'compaction_event') {
          updateSession(activeId, s => ({
            ...s,
            messages: [...s.messages, {
              type:         'compaction',
              tokensBefore: ev.payload.tokens_before,
              tokensAfter:  ev.payload.tokens_after,
            }],
          }))

        } else if (ev.event_type === 'error') {
          setError(ev.payload?.message || 'Orchestration error')
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current    = null
        setStreamingContent(null)
        setIsStreaming(false)
        setError('Connection lost — check backend URL and API key')
      }

    } catch (e) {
      setError(e.message)
      setStreamingContent(null)
      setIsStreaming(false)
    }
  }, [userInput, isStreaming, activeId, activeSession, config,
      apiKey, apiKeyType, azureEndpoint, azureApiVersion, backendUrl, updateSession])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Empty state (no orchestration configured) ─────────────────────────────────
  if (!hasOrchestration) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
        <MessageSquare size={32} strokeWidth={1} />
        <p className="text-xs text-center">
          Configure at least one <span className="text-slate-400">Node</span> or{' '}
          <span className="text-slate-400">Preset</span>,<br />
          then come back here to start chatting with your agents.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Session sidebar ── */}
      <div className="flex flex-col w-44 shrink-0 border-r border-slate-800 bg-slate-900">
        <div className="p-3 border-b border-slate-800">
          <button
            onClick={createSession}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/30 transition-colors"
          >
            <Plus size={12} /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-700 text-center mt-4 px-2">
              Click "New Chat" to start a conversation with your agents.
            </p>
          ) : (
            sessions.map(s => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeId}
                onClick={() => { setActiveId(s.id); setError(null) }}
                onDelete={() => deleteSession(s.id)}
              />
            ))
          )}
        </div>

        {/* Orchestration info */}
        <div className="p-3 border-t border-slate-800 text-xs text-slate-600">
          <p>{config.nodes?.length ?? 0} node{config.nodes?.length !== 1 ? 's' : ''}</p>
          {config.presets?.length > 0 && <p>{config.presets.length} preset{config.presets.length !== 1 ? 's' : ''}</p>}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Error banner — always visible, outside activeId gate */}
        {error && (
          <div className="shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            {error}
          </div>
        )}

        {!activeId ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-600">
            <MessageSquare size={32} strokeWidth={1} />
            <p className="text-xs">Create a new chat or select one from the sidebar.</p>
          </div>
        ) : (
          <>
            {/* Message thread */}
            <div className="flex-1 overflow-y-auto bg-slate-950 py-4">
              {messages.length === 0 && streamingContent === null && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-700 text-xs">
                  <p>Your message will run the full agent pipeline.</p>
                  <p className="text-slate-600 text-center max-w-xs">
                    Agents can reference <code className="text-slate-500">$.input.message</code> for your query
                    and <code className="text-slate-500">$.input.conversation_history</code> for prior turns.
                  </p>
                </div>
              )}

              {messages.map((msg, i) => {
                if (msg.type === 'compaction')
                  return <CompactionDivider key={i} tokensBefore={msg.tokensBefore} tokensAfter={msg.tokensAfter} />
                if (msg.role === 'user')
                  return <UserBubble key={i} content={msg.content} />
                if (msg.role === 'assistant')
                  return <AssistantBubble key={i} content={msg.content} />
                return null
              })}

              {streamingContent !== null && (
                <StreamingBubble content={streamingContent} />
              )}

              <div ref={bottomRef} className="h-2" />
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-slate-800 bg-slate-900 px-3 py-3 flex gap-2 items-end">
              <textarea
                ref={inputRef}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 transition-colors resize-none leading-relaxed max-h-32"
                rows={1}
                placeholder="Message your agents… (Enter to send, Shift+Enter for newline)"
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
