import { Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { useState } from 'react'

const KEY_TYPES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'azure', label: 'Azure OpenAI' },
]

export default function SettingsPanel({
  apiKey, setApiKey,
  apiKeyType, setApiKeyType,
  azureEndpoint, setAzureEndpoint,
  azureApiVersion, setAzureApiVersion,
  backendUrl, setBackendUrl,
}) {
  const [showKey, setShowKey] = useState(false)

  const inputCls = "w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 transition-colors"
  const isAzure = apiKeyType === 'azure'

  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Settings</h2>

      {/* Backend URL */}
      <div className="flex flex-col gap-1 mb-4">
        <label className="text-xs text-slate-400">Backend URL</label>
        <input
          className={inputCls}
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value.replace(/\/$/, ''))}
          placeholder="https://your-app.onrender.com"
        />
        <p className="text-xs text-slate-600">Render deployment URL (or localhost for local dev)</p>
      </div>

      {/* API Key Type */}
      <div className="flex flex-col gap-1 mb-3">
        <label className="text-xs text-slate-400">API Provider</label>
        <select className={inputCls} value={apiKeyType} onChange={(e) => setApiKeyType(e.target.value)}>
          {KEY_TYPES.map(k => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div className="flex flex-col gap-1 mb-4">
        <label className="text-xs text-slate-400">API Key <span className="text-slate-600">(sent with each request)</span></label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            className={`${inputCls} pr-8`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isAzure ? 'Azure OpenAI API key…' : 'sk-…'}
          />
          <button
            onClick={() => setShowKey(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      {/* Azure-specific fields */}
      {isAzure && (
        <div className="flex flex-col gap-3 mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-blue-300 font-medium">Azure OpenAI Configuration</p>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Endpoint URL</label>
            <input
              className={inputCls}
              value={azureEndpoint}
              onChange={(e) => setAzureEndpoint(e.target.value.replace(/\/$/, ''))}
              placeholder="https://your-resource.openai.azure.com"
            />
            <p className="text-xs text-slate-600">Your Azure OpenAI resource endpoint</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">API Version</label>
            <input
              className={inputCls}
              value={azureApiVersion}
              onChange={(e) => setAzureApiVersion(e.target.value)}
              placeholder="2024-02-01"
            />
          </div>

          <div className="text-xs text-slate-400 leading-relaxed">
            In the model selector, use <code className="text-indigo-400">azure/&lt;deployment-name&gt;</code> (e.g.{' '}
            <code className="text-indigo-400">azure/gpt-4o</code>).
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/70 leading-relaxed">
          For demo purposes only. The API key is sent in the request payload and is not stored.
          For production, configure keys as environment variables on your backend.
        </p>
      </div>

      <div className="mt-5 border-t border-slate-700 pt-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Alternatively, set{' '}
          <code className="text-indigo-400">OPENAI_API_KEY</code> /{' '}
          <code className="text-indigo-400">ANTHROPIC_API_KEY</code> /{' '}
          <code className="text-indigo-400">AZURE_API_KEY</code> + <code className="text-indigo-400">AZURE_API_BASE</code>{' '}
          as environment variables on Render. Leave the API key field blank when using server-side keys.
        </p>
      </div>
    </div>
  )
}
