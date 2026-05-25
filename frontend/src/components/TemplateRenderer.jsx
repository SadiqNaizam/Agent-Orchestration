import { AlertCircle, CheckCircle, Clock, Loader, RefreshCw, CheckCircle2 } from 'lucide-react'
import VariantCardGrid      from './templates/VariantCardGrid'
import EntityCardList       from './templates/EntityCardList'
import JourneyGridMatrix    from './templates/JourneyGridMatrix'
import CategorizedCardBoard from './templates/CategorizedCardBoard'
import TreeHierarchyView    from './templates/TreeHierarchyView'
import DataTable            from './templates/DataTable'
import DesignTokenViewer    from './templates/DesignTokenViewer'
import CanvasPreview        from './templates/CanvasPreview'
import GenericJSON          from './templates/GenericJSON'

// ── Template registry ─────────────────────────────────────────────────────────

const TEMPLATE_MAP = {
  variant_card_grid:      VariantCardGrid,
  entity_card_list:       EntityCardList,
  journey_grid_matrix:    JourneyGridMatrix,
  categorized_card_board: CategorizedCardBoard,
  tree_hierarchy_view:    TreeHierarchyView,
  data_table:             DataTable,
  design_token_viewer:    DesignTokenViewer,
  canvas_preview:         CanvasPreview,
  generic_json:           GenericJSON,
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     cls: 'bg-slate-700/60 text-slate-400 border-slate-600',          Icon: Clock        },
  in_progress: { label: 'In Progress', cls: 'bg-green-500/20 text-green-400 border-green-500/30',       Icon: Loader       },
  completed:   { label: 'Completed',   cls: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',    Icon: CheckCircle  },
  stale:       { label: 'Stale',       cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30',       Icon: RefreshCw    },
  skipped:     { label: 'Skipped',     cls: 'bg-slate-700/40 text-slate-500 border-slate-700',          Icon: null         },
}

function StatusBadge({ status }) {
  if (!status) return null
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const IconComp = cfg.Icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {IconComp && (
        <IconComp
          size={10}
          className={status === 'in_progress' ? 'animate-spin' : ''}
        />
      )}
      {cfg.label}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-4 w-48 rounded bg-slate-800" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col gap-2 p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="h-4 w-3/4 rounded bg-slate-700" />
            <div className="h-3 w-full rounded bg-slate-700/70" />
            <div className="h-3 w-5/6 rounded bg-slate-700/60" />
            <div className="h-3 w-4/6 rounded bg-slate-700/50" />
          </div>
        ))}
      </div>
      <div className="h-3 w-64 rounded bg-slate-800/60" />
    </div>
  )
}

// ── Error / unknown template card ─────────────────────────────────────────────

function UnknownTemplateCard({ templateId, data }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-500/30">
        <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-red-300">Unknown template</p>
          <p className="text-xs text-slate-400">
            No renderer found for template ID:{' '}
            <code className="font-mono text-red-300 bg-red-500/10 px-1 rounded">
              {templateId || '(none)'}
            </code>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Available templates: {Object.keys(TEMPLATE_MAP).join(', ')}
          </p>
        </div>
      </div>

      {data != null && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Raw Data</p>
          <pre className="text-xs font-mono text-slate-400 bg-slate-800/60 border border-slate-700 rounded-xl p-4 overflow-auto max-h-64 leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function TemplateRenderer({
  templateId,
  data,
  onSelect,
  selectedIndex,
  isLocked,
  stepLabel,
  stepStatus,
}) {
  const TemplateComponent = TEMPLATE_MAP[templateId]

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header bar */}
      {(stepLabel || stepStatus) && (
        <div className="flex items-center gap-3 shrink-0">
          {stepLabel && (
            <h2 className="text-sm font-semibold text-slate-200">{stepLabel}</h2>
          )}
          <StatusBadge status={stepStatus} />
          {isLocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-indigo-500/20 text-indigo-400 border-indigo-500/30 ml-auto">
              <CheckCircle2 size={10} />
              Selection sent
            </span>
          )}
        </div>
      )}

      {/* Content — pointer-events disabled while locked to prevent double-clicks */}
      <div className={`flex-1 overflow-y-auto min-h-0 transition-opacity ${isLocked ? 'opacity-60 pointer-events-none' : ''}`}>
        {data == null ? (
          <LoadingSkeleton />
        ) : TemplateComponent ? (
          <TemplateComponent
            data={data}
            onSelect={onSelect}
            selectedIndex={selectedIndex}
          />
        ) : (
          <UnknownTemplateCard templateId={templateId} data={data} />
        )}
      </div>
    </div>
  )
}
