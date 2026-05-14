import { useState, useCallback } from 'react'
import { Copy, Check, Pencil, X, DownloadCloud } from 'lucide-react'

// Fields that live in Settings, not in the importable config
const CREDENTIAL_KEYS = new Set(['api_key', 'api_key_type', 'azure_endpoint', 'azure_api_version'])

export default function PayloadPreview({ payload, onImport }) {
  const [copied,     setCopied]     = useState(false)
  const [editMode,   setEditMode]   = useState(false)
  const [draft,      setDraft]      = useState('')
  const [parseError, setParseError] = useState(null)

  // Sanitised display copy — mask the API key
  const display = {
    ...payload,
    api_key: payload.api_key ? '••••••••' + payload.api_key.slice(-4) : undefined,
  }
  const formatted = JSON.stringify(display, null, 2)

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openEdit = () => {
    // Populate with display version (no raw key)
    setDraft(formatted)
    setParseError(null)
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setParseError(null)
  }

  const applyImport = useCallback(() => {
    let parsed
    try {
      parsed = JSON.parse(draft)
    } catch (e) {
      setParseError(`JSON parse error: ${e.message}`)
      return
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      setParseError('Root value must be a JSON object.')
      return
    }

    // Strip credential fields — they live in Settings, not the config
    const clean = Object.fromEntries(
      Object.entries(parsed).filter(([k]) => !CREDENTIAL_KEYS.has(k))
    )

    onImport(clean)
    setEditMode(false)
    setParseError(null)
  }, [draft, onImport])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      applyImport()
    }
    if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900 shrink-0 gap-2">
        {editMode ? (
          <>
            <span className="text-xs text-slate-400">
              Paste a full config JSON — credentials stay in Settings
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <X size={11} /> Cancel
              </button>
              <button
                onClick={applyImport}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-colors font-medium"
              >
                <DownloadCloud size={11} /> Apply
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-xs text-slate-500">
              Live payload · {JSON.stringify(payload).length} bytes
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <Pencil size={11} /> Import JSON
              </button>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-mono">
          {parseError}
        </div>
      )}

      {/* Content */}
      {editMode ? (
        <textarea
          autoFocus
          className="flex-1 bg-slate-950 text-slate-200 text-xs font-mono p-4 resize-none focus:outline-none leading-relaxed border-0"
          value={draft}
          onChange={e => { setDraft(e.target.value); setParseError(null) }}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder="Paste a JSON config here…"
        />
      ) : (
        <div className="flex-1 overflow-y-auto bg-slate-950 p-4">
          <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
            <SyntaxHighlight json={formatted} />
          </pre>
        </div>
      )}

      {/* Edit-mode hint */}
      {editMode && (
        <div className="shrink-0 px-4 py-1.5 border-t border-slate-800 bg-slate-900 text-xs text-slate-600">
          Ctrl+Enter to apply · Esc to cancel
        </div>
      )}
    </div>
  )
}

// ── Syntax highlighting ────────────────────────────────────────────────────────

function SyntaxHighlight({ json }) {
  return <>{tokenize(json).map((tok, i) => <span key={i} className={tok.cls}>{tok.text}</span>)}</>
}

function tokenize(json) {
  const tokens = []
  const re = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([\[\]{},:])/g
  let last = 0, match

  while ((match = re.exec(json)) !== null) {
    if (match.index > last)
      tokens.push({ text: json.slice(last, match.index), cls: 'text-slate-500' })

    if      (match[1]) { tokens.push({ text: match[1], cls: 'text-indigo-300' }); tokens.push({ text: ':', cls: 'text-slate-500' }) }
    else if (match[2])   tokens.push({ text: match[2], cls: 'text-green-300' })
    else if (match[3])   tokens.push({ text: match[3], cls: 'text-amber-300' })
    else if (match[4])   tokens.push({ text: match[4], cls: 'text-violet-300' })
    else if (match[5])   tokens.push({ text: match[5], cls: 'text-slate-500' })

    last = re.lastIndex
  }

  if (last < json.length)
    tokens.push({ text: json.slice(last), cls: 'text-slate-500' })

  return tokens
}
