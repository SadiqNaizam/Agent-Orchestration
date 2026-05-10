import { useState, useRef, useCallback } from 'react'
import AgentBuilder from './components/AgentBuilder'
import TaskBuilder from './components/TaskBuilder'
import FlowBuilder from './components/FlowBuilder'
import LogViewer from './components/LogViewer'
import PayloadPreview from './components/PayloadPreview'
import SettingsPanel from './components/SettingsPanel'
import { Play, Square, Cpu, Settings, GitBranch, CheckSquare, Code, Terminal } from 'lucide-react'

const DEFAULT_BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const LLM_MODELS = [
  { label: 'GPT-4o Mini', value: 'openai/gpt-4o-mini' },
  { label: 'GPT-4o', value: 'openai/gpt-4o' },
  { label: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3-5-sonnet-20241022' },
  { label: 'Claude 3 Haiku', value: 'anthropic/claude-3-haiku-20240307' },
  { label: 'Gemini 1.5 Pro', value: 'gemini/gemini-1.5-pro' },
  { label: 'Gemini 1.5 Flash', value: 'gemini/gemini-1.5-flash' },
  { label: 'Ollama Llama3 (local)', value: 'ollama/llama3' },
]

export { LLM_MODELS }

export default function App() {
  // ── Builder state ───────────────────────────────────────────────────────────
  const [agents, setAgents] = useState([
    {
      id: 'agent-1',
      name: 'Researcher',
      role: 'Senior Research Analyst',
      goal: 'Uncover cutting-edge developments in the given topic and provide a detailed summary',
      backstory: 'You are an expert researcher with 10+ years of experience synthesising complex information.',
      llm: 'openai/gpt-4o-mini',
    },
  ])

  const [tasks, setTasks] = useState([
    {
      id: 'task-1',
      description: 'Research the latest trends in AI agent orchestration frameworks. Focus on popular tools, architecture patterns, and real-world use cases.',
      expected_output: 'A detailed report covering at least 5 key trends with examples',
      agent_id: 'agent-1',
    },
  ])

  const [flow, setFlow] = useState({
    process: 'sequential',
    manager_llm: 'openai/gpt-4o-mini',
  })

  const [apiKey, setApiKey] = useState('')
  const [apiKeyType, setApiKeyType] = useState('openai')
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND)

  // ── UI state ────────────────────────────────────────────────────────────────
  const [leftTab, setLeftTab] = useState('agents')   // agents | tasks | flow | settings
  const [rightTab, setRightTab] = useState('logs')   // logs | payload
  const [logs, setLogs] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [jobId, setJobId] = useState(null)
  const esRef = useRef(null)

  // ── Derived payload ─────────────────────────────────────────────────────────
  const payload = { agents, tasks, flow, api_key: apiKey || undefined, api_key_type: apiKeyType }

  // ── Run orchestration ───────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setRightTab('logs')
    setLogs([{ type: 'info', message: `⏳  Connecting to ${backendUrl} …` }])

    try {
      const res = await fetch(`${backendUrl}/api/orchestrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }

      const { job_id } = await res.json()
      setJobId(job_id)
      setLogs(prev => [...prev, { type: 'success', message: `✅  Job created: ${job_id}` }])

      // Open SSE stream
      const es = new EventSource(`${backendUrl}/api/stream/${job_id}`)
      esRef.current = es

      es.onmessage = (evt) => {
        const data = JSON.parse(evt.data)
        if (data.type === 'done') {
          es.close()
          esRef.current = null
          setIsRunning(false)
          setJobId(null)
        } else {
          setLogs(prev => [...prev, data])
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setLogs(prev => [...prev, { type: 'error', message: '❌  SSE connection lost' }])
        setIsRunning(false)
        setJobId(null)
      }
    } catch (err) {
      setLogs(prev => [...prev, { type: 'error', message: `❌  ${err.message}` }])
      setIsRunning(false)
    }
  }, [isRunning, backendUrl, payload])

  const handleStop = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setLogs(prev => [...prev, { type: 'warning', message: '⏹  Stopped by user' }])
    setIsRunning(false)
    setJobId(null)
  }, [])

  // ── Left tab config ─────────────────────────────────────────────────────────
  const leftTabs = [
    { id: 'agents', label: 'Agents', Icon: Cpu },
    { id: 'tasks', label: 'Tasks', Icon: CheckSquare },
    { id: 'flow', label: 'Flow', Icon: GitBranch },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ]

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-5 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-lg shadow-indigo-500/50 animate-pulse" />
          <span className="text-sm font-semibold tracking-widest text-indigo-300 uppercase">
            Agent Orchestration Studio
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isRunning && jobId && (
            <span className="text-xs text-slate-400 font-mono">job: {jobId.slice(0, 8)}…</span>
          )}
          <button
            onClick={isRunning ? handleStop : handleRun}
            disabled={!agents.length || !tasks.length}
            className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-semibold transition-all
              ${isRunning
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
          >
            {isRunning ? (
              <><Square size={14} /> Stop</>
            ) : (
              <><Play size={14} /> Run Crew</>
            )}
          </button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: Builder ── */}
        <div className="flex flex-col w-[420px] min-w-[320px] border-r border-slate-700 bg-slate-900 shrink-0">
          {/* Tab bar */}
          <div className="flex border-b border-slate-700 bg-slate-800 shrink-0">
            {leftTabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setLeftTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2
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

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {leftTab === 'agents' && (
              <AgentBuilder agents={agents} setAgents={setAgents} />
            )}
            {leftTab === 'tasks' && (
              <TaskBuilder tasks={tasks} setTasks={setTasks} agents={agents} />
            )}
            {leftTab === 'flow' && (
              <FlowBuilder flow={flow} setFlow={setFlow} />
            )}
            {leftTab === 'settings' && (
              <SettingsPanel
                apiKey={apiKey} setApiKey={setApiKey}
                apiKeyType={apiKeyType} setApiKeyType={setApiKeyType}
                backendUrl={backendUrl} setBackendUrl={setBackendUrl}
              />
            )}
          </div>
        </div>

        {/* ── Right panel: Logs + Payload ── */}
        <div className="flex flex-col flex-1 min-w-0 bg-slate-900">
          {/* Tab bar */}
          <div className="flex border-b border-slate-700 bg-slate-800 shrink-0">
            {[
              { id: 'logs', label: 'Execution Logs', Icon: Terminal },
              { id: 'payload', label: 'JSON Payload', Icon: Code },
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

            {/* Status dot */}
            <div className="ml-auto flex items-center pr-4 gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors
                ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`}
              />
              <span className="text-xs text-slate-500">
                {isRunning ? 'running' : 'idle'}
              </span>
            </div>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {rightTab === 'logs' && (
              <LogViewer logs={logs} isRunning={isRunning} onClear={() => setLogs([])} />
            )}
            {rightTab === 'payload' && (
              <PayloadPreview payload={payload} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
