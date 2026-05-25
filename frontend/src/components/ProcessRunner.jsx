/**
 * ProcessRunner — the top-level UI for process-driven agent orchestration (Pensieve).
 *
 * Layout
 * ───────
 *  ┌─────────────────────────────────────────────────────┐
 *  │  Header: process name + Run/Stop + api key          │
 *  ├─────────────────────────────────────────────────────┤
 *  │  PhaseNav: phase tabs with step completion status   │
 *  ├──────────────────────────────┬──────────────────────┤
 *  │  Left: TemplateRenderer      │  Right: ProcessChat  │
 *  │  (current artifact display)  │  (main agent chat)   │
 *  └──────────────────────────────┴──────────────────────┘
 *
 * SSE events consumed
 * ────────────────────
 *  chat_chunk      → append to streaming buffer
 *  chat_message    → add complete message
 *  chat_done       → flush streaming buffer to messages
 *  artifact_update → update left panel (templateId + data)
 *  state_update    → update phase nav + process state
 *  gate            → show gate card in right panel
 *  error           → show error toast
 *  node_start      → show sub-agent activity indicator
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Square, Upload, ChevronDown } from 'lucide-react'
import PhaseNav from './PhaseNav'
import ProcessChat from './ProcessChat'
import TemplateRenderer from './TemplateRenderer'

const PRESET_PROCESSES = [
  { label: 'Generate UI Design (v2 — AAVA)', path: '/generate-ui-design-process.md' },
  { label: 'Generate UI Design (v1 — Legacy)', path: '/ux-design-process.md' },
]

export default function ProcessRunner({ apiKey, apiKeyType, azureEndpoint, azureApiVersion, backendUrl }) {
  // ── Run state ──────────────────────────────────────────────────────────────
  const [runId,    setRunId]    = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [processMd, setProcessMd] = useState('')
  const [processLabel, setProcessLabel] = useState('Process Runner')
  const [selectedPreset, setSelectedPreset] = useState(0)

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages,        setMessages]        = useState([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isThinking,      setIsThinking]      = useState(false)
  const [gate,            setGate]            = useState(null)

  // ── Left panel state ───────────────────────────────────────────────────────
  const [currentArtifact, setCurrentArtifact] = useState(null)
  // { templateId, data, artifactKey, version }
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [isSelectionLocked, setIsSelectionLocked] = useState(false)

  // ── Phase nav state ────────────────────────────────────────────────────────
  const [phases,      setPhases]      = useState([])
  const [processState, setProcessState] = useState(null)

  // ── Project brief input ────────────────────────────────────────────────────
  const [briefText, setBriefText]         = useState('')
  const [showBriefInput, setShowBriefInput] = useState(true)

  const esRef      = useRef(null)
  const fileRef    = useRef(null)

  // ── Load default process.md ────────────────────────────────────────────────
  useEffect(() => {
    const path = PRESET_PROCESSES[selectedPreset]?.path || PRESET_PROCESSES[0].path
    fetch(path)
      .then(r => r.ok ? r.text() : '')
      .then(text => { if (text) setProcessMd(text) })
      .catch(() => {})
  }, [selectedPreset])

  // ── Start a run ────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!processMd.trim()) {
      alert('Please load a process.md file first.')
      return
    }
    setIsRunning(true)
    setMessages([])
    setStreamingContent('')
    setGate(null)
    setCurrentArtifact(null)
    setPhases([])
    setProcessState(null)

    let projectBrief = null
    if (briefText.trim()) {
      projectBrief = { description: briefText.trim() }
    }

    try {
      const res = await fetch(`${backendUrl}/api/pensieve/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          process_md:       processMd,
          project_brief:    projectBrief,
          api_key:          apiKey || undefined,
          api_key_type:     apiKeyType,
          azure_endpoint:   azureEndpoint || undefined,
          azure_api_version: azureApiVersion,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }

      const { run_id, process_label } = await res.json()
      setRunId(run_id)
      if (process_label) setProcessLabel(process_label)
      setShowBriefInput(false)

      // Open SSE stream
      const es = new EventSource(`${backendUrl}/api/stream/${run_id}`)
      esRef.current = es

      let streamBuf = ''

      es.onmessage = (evt) => {
        const item = JSON.parse(evt.data)

        if (item.type === 'done') {
          es.close()
          esRef.current = null
          setIsRunning(false)
          if (streamBuf) {
            setMessages(prev => [...prev, { role: 'assistant', content: streamBuf }])
            setStreamingContent('')
          }
          setIsThinking(false)
          return
        }

        if (item.type !== 'event') return
        const { event_type, payload } = item.data

        if (event_type === 'chat_chunk') {
          streamBuf += payload.content || ''
          setStreamingContent(streamBuf)
          setIsThinking(false)
        }

        else if (event_type === 'chat_message') {
          const content = payload.content || ''
          setMessages(prev => [...prev, { role: 'assistant', content }])
          setStreamingContent('')
          streamBuf = ''
          setIsThinking(false)
        }

        else if (event_type === 'chat_done') {
          if (streamBuf) {
            setMessages(prev => [...prev, { role: 'assistant', content: streamBuf }])
            setStreamingContent('')
            streamBuf = ''
          }
          setIsThinking(false)
        }

        else if (event_type === 'node_start') {
          setIsThinking(true)
        }

        else if (event_type === 'node_complete') {
          setIsThinking(false)
        }

        else if (event_type === 'artifact_update') {
          setCurrentArtifact({
            templateId:  payload.template_id || 'generic_json',
            data:        payload.data,
            artifactKey: payload.artifact_key,
            version:     payload.version,
          })
          setGate(null)
          setSelectedIndex(null)
          setIsSelectionLocked(false)      // new artifact — allow fresh selection
        }

        else if (event_type === 'state_update') {
          if (payload.phases)        setPhases(payload.phases)
          if (payload.process_state) setProcessState(payload.process_state)
        }

        else if (event_type === 'gate') {
          setGate(payload)
          setIsThinking(false)
          if (streamBuf) {
            setMessages(prev => [...prev, { role: 'assistant', content: streamBuf }])
            setStreamingContent('')
            streamBuf = ''
          }
        }

        else if (event_type === 'error') {
          setIsThinking(false)
          setMessages(prev => [...prev, {
            role: 'system',
            content: `⚠ ${payload.error_type || 'Error'}: ${payload.message}`,
          }])
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setIsRunning(false)
        setIsThinking(false)
        setMessages(prev => [...prev, {
          role: 'system',
          content: 'Connection lost. The run may still be processing on the server.',
        }])
      }

    } catch (err) {
      setMessages([{ role: 'system', content: `Failed to start: ${err.message}` }])
      setIsRunning(false)
    }
  }, [processMd, briefText, apiKey, apiKeyType, azureEndpoint, azureApiVersion, backendUrl])

  const handleStop = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    setIsRunning(false)
    setIsThinking(false)
  }, [])

  // ── Left-panel selection: highlight + notify agent ─────────────────────────
  const handleSelect = useCallback((index, label) => {
    if (isSelectionLocked) return          // ignore duplicate clicks
    setSelectedIndex(index)
    setIsSelectionLocked(true)             // lock immediately — one selection per artifact
    if (!runId) return
    const msg = label
      ? `I select: "${label}"`
      : `I select option ${(index ?? 0) + 1}`

    if (gate) {
      // A gate (request_approval) is blocking the runner — route the selection
      // as an approval so wait_for_approval wakes up cleanly.
      setGate(null)
      fetch(`${backendUrl}/api/pensieve/${runId}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ approved: true, feedback: msg }),
      }).catch(() => {})
    } else {
      // No active gate — send as a regular chat message.
      fetch(`${backendUrl}/api/pensieve/${runId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: msg }),
      }).catch(() => {})
    }
  }, [runId, backendUrl, gate, isSelectionLocked])

  const handleNavigate = useCallback(async (stepId) => {
    if (!runId) return
    await fetch(`${backendUrl}/api/pensieve/${runId}/message`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content: `Navigate to step: ${stepId}` }),
    })
  }, [runId, backendUrl])

  // ── File upload for process.md ─────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setProcessMd(ev.target.result || '')
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Current step label for template header ─────────────────────────────────
  const currentStepLabel = processState
    ? processState.steps?.find(s => s.id === processState.current_step)?.label || ''
    : ''

  const currentStepStatus = processState
    ? processState.steps?.find(s => s.id === processState.current_step)?.status || 'pending'
    : 'pending'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Sub-header: process name + controls ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-200">{processLabel}</span>
          {processState && (
            <span className="text-xs text-slate-500 font-mono">
              {processState.current_phase && `${processState.current_phase} →`} {processState.current_step}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Preset selector */}
          {!isRunning && (
            <select
              value={selectedPreset}
              onChange={e => setSelectedPreset(Number(e.target.value))}
              className="text-xs bg-slate-700 border border-slate-600 text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
            >
              {PRESET_PROCESSES.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
          )}
          <input ref={fileRef} type="file" accept=".md" onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isRunning}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30"
          >
            <Upload size={12} /> Load custom
          </button>
          <button
            onClick={isRunning ? handleStop : handleStart}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all
              ${isRunning
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
          >
            {isRunning ? <><Square size={11} /> Stop</> : <><Play size={11} /> Start</>}
          </button>
        </div>
      </div>

      {/* ── Phase nav ── */}
      {phases.length > 0 && (
        <PhaseNav
          phases={phases}
          currentPhase={processState?.current_phase}
          currentStep={processState?.current_step}
          onNavigate={handleNavigate}
        />
      )}

      {/* ── Main split: left (template) + right (chat) ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — artifact display */}
        <div className="flex-1 overflow-hidden border-r border-slate-700 bg-slate-950">
          {showBriefInput && !isRunning ? (
            /* Brief input shown before first run */
            <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
              <div className="text-center">
                <div className="text-4xl mb-3">✦</div>
                <h2 className="text-base font-semibold text-slate-200 mb-1">{processLabel}</h2>
                <p className="text-xs text-slate-500 max-w-sm">
                  Paste your project brief below, then click Start. The agent will guide you through
                  each step of the process.
                </p>
              </div>
              <textarea
                value={briefText}
                onChange={e => setBriefText(e.target.value)}
                placeholder={`Example:\n\nProduct: Ride-hailing app for enterprise employees\nProblem: Employees struggle to book compliant business travel\nUsers: Corporate employees, travel managers\nConstraints: Must integrate with Concur, ISO 27001 compliance required`}
                rows={8}
                className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-xs text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500 font-mono"
              />
              <p className="text-xs text-slate-600">
                Or start without a brief — the agent will ask you for it.
              </p>
            </div>
          ) : (
            <TemplateRenderer
              templateId={currentArtifact?.templateId}
              data={currentArtifact?.data}
              stepLabel={currentStepLabel}
              stepStatus={currentStepStatus}
              onSelect={handleSelect}
              selectedIndex={selectedIndex}
              isLocked={isSelectionLocked}
            />
          )}
        </div>

        {/* Right panel — chat */}
        <div className="w-[360px] min-w-[300px] shrink-0 overflow-hidden">
          <ProcessChat
            runId={runId}
            backendUrl={backendUrl}
            messages={messages}
            isThinking={isThinking}
            streamingContent={streamingContent}
            gate={gate}
            onGateApprove={() => setGate(null)}
          />
        </div>
      </div>
    </div>
  )
}
