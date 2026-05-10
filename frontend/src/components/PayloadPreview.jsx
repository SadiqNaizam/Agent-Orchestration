import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function PayloadPreview({ payload }) {
  const [copied, setCopied] = useState(false)

  // Sanitise for display — mask the API key
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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
        <span className="text-xs text-slate-500">
          Live payload · {JSON.stringify(payload).length} bytes
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* JSON */}
      <div className="flex-1 overflow-y-auto bg-slate-950 p-4">
        <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
          <SyntaxHighlight json={formatted} />
        </pre>
      </div>
    </div>
  )
}

// Simple token-based syntax highlighting
function SyntaxHighlight({ json }) {
  const tokens = tokenize(json)
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} className={tok.cls}>{tok.text}</span>
      ))}
    </>
  )
}

function tokenize(json) {
  const tokens = []
  const re = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([\[\]{},:])/g
  let last = 0
  let match

  while ((match = re.exec(json)) !== null) {
    if (match.index > last) {
      tokens.push({ text: json.slice(last, match.index), cls: 'text-slate-500' })
    }

    if (match[1]) {
      // Key
      tokens.push({ text: match[1], cls: 'text-indigo-300' })
      tokens.push({ text: ':', cls: 'text-slate-500' })
    } else if (match[2]) {
      // String value
      tokens.push({ text: match[2], cls: 'text-green-300' })
    } else if (match[3]) {
      // Number
      tokens.push({ text: match[3], cls: 'text-amber-300' })
    } else if (match[4]) {
      // Boolean / null
      tokens.push({ text: match[4], cls: 'text-violet-300' })
    } else if (match[5]) {
      // Punctuation
      tokens.push({ text: match[5], cls: 'text-slate-500' })
    }

    last = re.lastIndex
  }

  if (last < json.length) {
    tokens.push({ text: json.slice(last), cls: 'text-slate-500' })
  }

  return tokens
}
