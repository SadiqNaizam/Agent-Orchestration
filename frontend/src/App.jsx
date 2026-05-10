import { useState, useRef, useCallback } from 'react'
import NodeBuilder from './components/NodeBuilder'
import EdgeBuilder from './components/EdgeBuilder'
import InputPanel from './components/InputPanel'
import PresetBuilder from './components/PresetBuilder'
import ChatPanel from './components/ChatPanel'
import EventViewer from './components/EventViewer'
import PayloadPreview from './components/PayloadPreview'
import SettingsPanel from './components/SettingsPanel'
import { Play, Square, Cpu, GitBranch, Database, Settings, Code, Activity, Layers, MessageSquare } from 'lucide-react'

const DEFAULT_BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Default orchestration config ──────────────────────────────────────────────
const DEFAULT_CONFIG = {
  orchestration_id: 'orch-001',
  name: 'Research & Write Pipeline',
  nodes: [
    {
      node_id: 'researcher',
      agent: {
        agent_id: 'researcher',
        name: 'Researcher',
        description: 'Finds and synthesises information on a given topic',
        system_prompt:
          'You are a senior research analyst with 10+ years of experience synthesising complex information from diverse sources. You produce structured, factual summaries.',
        instructions:
          'Research the provided topic thoroughly. Produce a structured summary covering: key trends, notable developments, major players, and open questions. Be specific and factual.',
        model: { provider: 'openai', model_name: 'gpt-4o-mini', temperature: 0.3, max_tokens: null },
      },
      context_mode: 'scoped',
      input_mapping: { topic: '$.input.message' },
      output_mapping: {},
      error_policy: null,
    },
    {
      node_id: 'writer',
      agent: {
        agent_id: 'writer',
        name: 'Writer',
        description: 'Turns research findings into polished prose',
        system_prompt:
          'You are a professional technology writer who creates clear, engaging, and well-structured articles for a technically literate audience.',
        instructions:
          'Write a polished article based on the research findings provided. Use clear headings, concrete examples, and an engaging narrative. Aim for ~400 words.',
        model: { provider: 'openai', model_name: 'gpt-4o-mini', temperature: 0.7, max_tokens: null },
      },
      context_mode: 'scoped',
      input_mapping: { research: '$.researcher.output' },
      output_mapping: {},
      error_policy: null,
    },
  ],
  edges: [
    { edge_id: 'e1', from: '__start__', to: 'researcher' },
    { edge_id: 'e2', from: 'researcher', to: 'writer' },
    { edge_id: 'e3', from: 'writer',     to: '__end__' },
  ],
  presets: [],
  error_policy: null,
  compaction: null,
  streaming: { chunk_size_chars: 200, provenance_enabled: false },
  input: { topic: 'The future of AI agent orchestration frameworks' },
}

// ── Pipeline summary (shown in left column when Chat tab is active) ────────────
function PipelineSummary({ config }) {
  const nodes   = config.nodes   || []
  const presets = config.presets || []
  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Active Pipeline</p>

      {nodes.length === 0 && presets.length === 0 && (
        <p className="text-xs text-slate-600">No nodes or presets configured.</p>
      )}

      {nodes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {nodes.map((n, i) => (
            <div key={n.node_id} className="flex items-center gap-2">
              {i > 0 && <div className="w-px h-3 bg-slate-700 ml-2.5 -mt-3 absolute" />}
              <div className="flex items-center gap-2 w-full">
                <div className="w-5 h-5 rounded bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center shrink-0">
                  <Cpu size={10} className="text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate">{n.agent.name || n.node_id}</p>
                  <p className="text-xs text-slate-600 truncate">{n.agent.model.provider}/{n.agent.model.model_name}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {presets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {presets.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-violet-600/20 border border-violet-600/30 flex items-center justify-center shrink-0">
                <Layers size={10} className="text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">{p.preset_id}</p>
                <p className="text-xs text-slate-600">{p.pattern}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 p-2.5 rounded bg-slate-800/60 border border-slate-700 text-xs text-slate-600 leading-relaxed">
        Agents receive <code className="text-indigo-400">$.input.message</code> and{' '}
        <code className="text-indigo-400">$.input.conversation_history</code> on each turn.
      </div>
    </div>
  )
}

export default function App() {
  // ── Orchestration config state ─────────────────────────────────────────────
  const [config, setConfig]               = useState(DEFAULT_CONFIG)

  // ── Credentials & backend ──────────────────────────────────────────────────
  const [apiKey, setApiKey]               = useState('')
  const [apiKeyType, setApiKeyType]       = useState('openai')
  const [azureEndpoint, setAzureEndpoint] = useState('')
  const [azureApiVersion, setAzureApiVersion] = useState('2024-02-01')
  const [backendUrl, setBackendUrl]       = useState(DEFAULT_BACKEND)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [leftTab,  setLeftTab]  = useState('nodes')
  const [rightTab, setRightTab] = useState('events')
  const [events,   setEvents]   = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [jobId,    setJobId]    = useState(null)
  const esRef = useRef(null)

  // ── Build payload ──────────────────────────────────────────────────────────
  const payload = {
    ...config,
    api_key:           apiKey || undefined,
    api_key_type:      apiKeyType,
    ...(apiKeyType === 'azure' && azureEndpoint
      ? { azure_endpoint: azureEndpoint, azure_api_version: azureApiVersion }
      : {}),
  }

  // ── Run orchestration ──────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setRightTab('events')
    setEvents([{
      event_type: 'info',
      payload: { message: `Connecting to ${backendUrl} …` },
      timestamp: new Date().toISOString(),
      sequence: 0,
    }])

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
      setJobId(job_id)

      setEvents(prev => [...prev, {
        event_type: 'info',
        payload: { message: `Job created: ${job_id}` },
        timestamp: new Date().toISOString(),
        sequence: 0.5,
      }])

      const es = new EventSource(`${backendUrl}/api/stream/${job_id}`)
      esRef.current = es

      es.onmessage = (evt) => {
        const item = JSON.parse(evt.data)
        if (item.type === 'done') {
          es.close()
          esRef.current = null
          setIsRunning(false)
          setJobId(null)
        } else if (item.type === 'event') {
          setEvents(prev => [...prev, item.data])
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setEvents(prev => [...prev, {
          event_type: 'error',
          payload: { error_type: 'connection', message: 'SSE connection lost', policy_applied: 'fail' },
          timestamp: new Date().toISOString(),
          sequence: -1,
        }])
        setIsRunning(false)
        setJobId(null)
      }
    } catch (err) {
      setEvents(prev => [...prev, {
        event_type: 'error',
        payload: { error_type: 'request', message: err.message, policy_applied: 'fail' },
        timestamp: new Date().toISOString(),
        sequence: -1,
      }])
      setIsRunning(false)
    }
  }, [isRunning, backendUrl, payload])

  const handleStop = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    setEvents(prev => [...prev, {
      event_type: 'info',
      payload: { message: 'Stopped by user' },
      timestamp: new Date().toISOString(),
      sequence: -1,
    }])
    setIsRunning(false)
    setJobId(null)
  }, [])

  // ── Tab config ─────────────────────────────────────────────────────────────
  const leftTabs = [
    { id: 'nodes',    label: 'Nodes',    Icon: Cpu },
    { id: 'edges',    label: 'Edges',    Icon: GitBranch },
    { id: 'presets',  label: 'Presets',  Icon: Layers },
    { id: 'input',    label: 'Input',    Icon: Database },
    { id: 'settings', label: 'Settings', Icon: Settings },
    { id: 'chat',     label: 'Chat',     Icon: MessageSquare },
  ]

  const nodeIds = config.nodes.map(n => n.node_id)

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-5 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-lg shadow-indigo-500/50 animate-pulse" />
          <span className="text-sm font-semibold tracking-widest text-indigo-300 uppercase">
            Agent Orchestration Studio
          </span>
          <span className="text-xs text-slate-500 font-mono ml-2">
            {config.orchestration_id}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isRunning && jobId && (
            <span className="text-xs text-slate-400 font-mono">job: {jobId.slice(0, 8)}…</span>
          )}
          <button
            onClick={isRunning ? handleStop : handleRun}
            disabled={leftTab === 'chat' || (!config.nodes.length && !config.presets?.length)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-semibold transition-all
              ${isRunning
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
          >
            {isRunning ? <><Square size={14} /> Stop</> : <><Play size={14} /> Run</>}
          </button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left column — ALWAYS rendered so tabs are never hidden ── */}
        <div className="flex flex-col w-[440px] min-w-[340px] border-r border-slate-700 bg-slate-900 shrink-0">

          {/* Tab bar — always visible */}
          <div className="flex overflow-x-auto border-b border-slate-700 bg-slate-800 shrink-0 scrollbar-none">
            {leftTabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setLeftTab(id)}
                className={`flex items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 shrink-0
                  ${leftTab === id
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* Content — pipeline summary when Chat, editor panels otherwise */}
          {leftTab === 'chat' ? (
            <PipelineSummary config={config} />
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {leftTab === 'nodes' && (
                <NodeBuilder
                  nodes={config.nodes}
                  setNodes={(u) => setConfig(c => ({ ...c, nodes: typeof u === 'function' ? u(c.nodes) : u }))}
                />
              )}
              {leftTab === 'edges' && (
                <EdgeBuilder
                  edges={config.edges}
                  setEdges={(u) => setConfig(c => ({ ...c, edges: typeof u === 'function' ? u(c.edges) : u }))}
                  nodeIds={nodeIds}
                />
              )}
              {leftTab === 'presets' && (
                <PresetBuilder
                  presets={config.presets || []}
                  setPresets={(u) => setConfig(c => ({ ...c, presets: typeof u === 'function' ? u(c.presets || []) : u }))}
                />
              )}
              {leftTab === 'input' && (
                <InputPanel
                  input={config.input}
                  setInput={(input) => setConfig(c => ({ ...c, input }))}
                  orchestrationId={config.orchestration_id}
                  setOrchestrationId={(id) => setConfig(c => ({ ...c, orchestration_id: id }))}
                  compaction={config.compaction}
                  setCompaction={(compaction) => setConfig(c => ({ ...c, compaction }))}
                  errorPolicy={config.error_policy}
                  setErrorPolicy={(error_policy) => setConfig(c => ({ ...c, error_policy }))}
                  streaming={config.streaming}
                  setStreaming={(streaming) => setConfig(c => ({ ...c, streaming }))}
                />
              )}
              {leftTab === 'settings' && (
                <SettingsPanel
                  apiKey={apiKey}             setApiKey={setApiKey}
                  apiKeyType={apiKeyType}     setApiKeyType={setApiKeyType}
                  azureEndpoint={azureEndpoint}   setAzureEndpoint={setAzureEndpoint}
                  azureApiVersion={azureApiVersion} setAzureApiVersion={setAzureApiVersion}
                  backendUrl={backendUrl}     setBackendUrl={setBackendUrl}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Right area ── */}
        {leftTab === 'chat' ? (
          <ChatPanel
            config={config}
            apiKey={apiKey}
            apiKeyType={apiKeyType}
            azureEndpoint={azureEndpoint}
            azureApiVersion={azureApiVersion}
            backendUrl={backendUrl}
          />
        ) : (
          <div className="flex flex-col flex-1 min-w-0 bg-slate-900">
            <div className="flex border-b border-slate-700 bg-slate-800 shrink-0">
              {[
                { id: 'events',  label: 'Execution Events', Icon: Activity },
                { id: 'payload', label: 'JSON Payload',     Icon: Code },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setRightTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2
                    ${rightTab === id
                      ? 'border-indigo-500 text-indigo-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center pr-4 gap-2">
                <div className={`w-2 h-2 rounded-full transition-colors
                  ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`}
                />
                <span className="text-xs text-slate-500">
                  {isRunning ? 'running' : 'idle'}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightTab === 'events' && (
                <EventViewer
                  events={events}
                  isRunning={isRunning}
                  onClear={() => setEvents([])}
                />
              )}
              {rightTab === 'payload' && (
                <PayloadPreview payload={payload} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
