import { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

const LEVEL_COLORS = [
  'text-indigo-400 border-indigo-500/40',
  'text-violet-400 border-violet-500/40',
  'text-blue-400   border-blue-500/40',
  'text-slate-300  border-slate-600/40',
]

function levelColor(depth) {
  return LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)]
}

function countDescendants(node) {
  if (!node.children?.length) return 0
  return node.children.reduce((acc, child) => acc + 1 + countDescendants(child), 0)
}

function TreeNode({ node, depth = 0, defaultOpen = true, selectedLabel, onSelectNode }) {
  const [open, setOpen] = useState(defaultOpen || depth === 0)
  const hasChildren  = node.children?.length > 0
  const descendants  = useMemo(() => countDescendants(node), [node])
  const colorCls     = levelColor(depth)
  const indentPx     = depth * 24
  const isSelected   = selectedLabel === node.label

  return (
    <div className="relative">
      {/* Node row */}
      <div
        onClick={() => onSelectNode?.(node.label)}
        className={`flex items-start gap-2 py-1.5 group cursor-pointer rounded transition-colors hover:bg-slate-800/60
          ${isSelected ? 'bg-indigo-500/10' : ''}
        `}
        style={{ paddingLeft: `${indentPx}px` }}
      >
        {/* Dashed connector line (for non-root nodes) */}
        {depth > 0 && (
          <div
            className="absolute border-l border-dashed border-slate-600/50"
            style={{
              left:   `${indentPx - 12}px`,
              top:    0,
              bottom: 0,
            }}
          />
        )}

        {/* Toggle button or spacer */}
        <div className="shrink-0 mt-0.5">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
              className="w-4 h-4 flex items-center justify-center rounded hover:bg-slate-700 transition-colors text-slate-500"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-slate-600" />
            </div>
          )}
        </div>

        {/* Label + metadata */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isSelected ? 'text-indigo-300' : colorCls.split(' ')[0]}`}>
              {node.label}
            </span>
            {descendants > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-500 border border-slate-700">
                {descendants}
              </span>
            )}
          </div>
          {node.description && (
            <p className="text-xs text-slate-500 leading-relaxed">{node.description}</p>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && open && (
        <div className="relative">
          {/* Vertical dashed line from parent toggle to last child */}
          <div
            className="absolute border-l border-dashed border-slate-700/50"
            style={{
              left:   `${indentPx + 8}px`,
              top:    0,
              bottom: 0,
            }}
          />
          {node.children.map((child, i) => (
            <TreeNode
              key={i}
              node={child}
              depth={depth + 1}
              defaultOpen={depth < 1}
              selectedLabel={selectedLabel}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TreeHierarchyView({ data = {}, onSelect }) {
  const { root, children = [] } = data
  const [selectedLabel, setSelectedLabel] = useState(null)

  const handleSelectNode = useCallback((label) => {
    setSelectedLabel(label)
    onSelect?.(null, label)
  }, [onSelect])

  if (!root && !children.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        No hierarchy data available.
      </div>
    )
  }

  const rootNode = {
    label:       root || 'Root',
    description: data.description,
    children,
  }

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-700 p-4 overflow-x-auto">
      <TreeNode
        node={rootNode}
        depth={0}
        defaultOpen
        selectedLabel={selectedLabel}
        onSelectNode={handleSelectNode}
      />
    </div>
  )
}
