import { useState } from 'react'
import { ZoomIn, ZoomOut, Download } from 'lucide-react'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function CanvasPreview({ data = {}, onSelect, selectedIndex }) {
  const { screens = [] } = data
  const [zoomIdx, setZoomIdx] = useState(2)   // default index = 1.0

  const zoom    = ZOOM_STEPS[zoomIdx]
  const zoomIn  = () => setZoomIdx(i => Math.min(i + 1, ZOOM_STEPS.length - 1))
  const zoomOut = () => setZoomIdx(i => Math.max(i - 1, 0))

  const handleExport = () => {
    const lines = screens.map(screen => {
      const header  = `=== ${screen.name} ===`
      const desc    = screen.description ? `\n${screen.description}\n` : ''
      const content = screen.elements
        ? (Array.isArray(screen.elements) ? screen.elements.join('\n') : String(screen.elements))
        : ''
      return [header, desc, content, ''].join('\n')
    })
    const text = lines.join('\n' + '─'.repeat(60) + '\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `wireframes-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!screens.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        No screens available.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={zoomOut}
            disabled={zoomIdx === 0}
            className="flex items-center justify-center w-7 h-7 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-30 transition-colors"
          >
            <ZoomOut size={13} />
          </button>
          <span className="text-xs text-slate-500 font-mono w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={zoomIdx === ZOOM_STEPS.length - 1}
            className="flex items-center justify-center w-7 h-7 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-30 transition-colors"
          >
            <ZoomIn size={13} />
          </button>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
        >
          <Download size={12} />
          Export
        </button>
      </div>

      {/* Canvas */}
      <div className="overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-4">
        <div
          className="grid gap-4 transition-transform origin-top-left"
          style={{
            transform:           `scale(${zoom})`,
            transformOrigin:     'top left',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            width:               zoom < 1 ? `${(1 / zoom) * 100}%` : undefined,
          }}
        >
          {screens.map((screen, i) => {
            // Support both screen.name and screen.screen_name
            const screenName = screen.name || screen.screen_name || `Screen ${i + 1}`
            // Support ascii_layout as well as elements
            const rawElements = screen.ascii_layout || screen.elements
            const elements = rawElements
              ? (Array.isArray(rawElements) ? rawElements.join('\n') : String(rawElements))
              : null

            return (
              <div
                key={i}
                onClick={() => onSelect?.(i, screenName)}
                className={`flex flex-col gap-2 p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer transition-all hover:border-slate-600
                  ${selectedIndex === i ? 'ring-2 ring-indigo-500 border-slate-600' : ''}
                `}
              >
                {/* Screen header */}
                <div className="flex items-center gap-2 pb-2 border-b border-slate-700/60">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-amber-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                  <p className="text-xs font-semibold text-slate-300 truncate">{screenName}</p>
                  {screen.screen_id && (
                    <span className="text-xs font-mono text-slate-600 ml-auto shrink-0">{screen.screen_id}</span>
                  )}
                </div>

                {/* Description */}
                {(screen.description || screen.visual_description) && (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {screen.description || screen.visual_description}
                  </p>
                )}

                {/* Wireframe block */}
                {elements ? (
                  <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 overflow-hidden">
                    <pre className="text-xs font-mono text-slate-400 leading-relaxed p-3 whitespace-pre overflow-x-auto">
                      {elements}
                    </pre>
                  </div>
                ) : (
                  <div className="h-24 rounded-lg border border-dashed border-slate-700 flex items-center justify-center">
                    <span className="text-xs text-slate-700">No wireframe content</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
