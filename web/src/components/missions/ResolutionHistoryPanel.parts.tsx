import { useTranslation } from 'react-i18next'
import {
  BookUp,
  Share2,
  Download,
  CheckCircle,
  Clock,
  Tag,
  ChevronDown,
  ChevronRight,
  Trash2,
  ArrowLeft,
} from 'lucide-react'
import type { Resolution } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'

export interface ResolutionCardProps {
  resolution: Resolution
  isExpanded: boolean
  isSelected: boolean
  onToggle: () => void
  onToggleSelect: () => void
  onView: () => void
  onApply?: () => void
  onDelete: () => void
  onShare?: () => void
  onExport?: () => void
  onSubmitToKB?: () => void
  showSharedBy?: boolean
  canShare?: boolean
}

export function ResolutionCard({
  resolution,
  isExpanded,
  isSelected,
  onToggle,
  onToggleSelect,
  onView,
  onApply,
  onDelete,
  onShare,
  onExport,
  onSubmitToKB,
  showSharedBy,
  canShare,
}: ResolutionCardProps) {
  const { t } = useTranslation()
  const { effectiveness } = resolution
  const successRate = effectiveness.timesUsed > 0
    ? Math.round((effectiveness.timesSuccessful / effectiveness.timesUsed) * 100)
    : null

  const formattedDate = new Date(resolution.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className={cn(
      "border border-border rounded-lg bg-secondary/30 overflow-hidden",
      isSelected && "ring-2 ring-primary/50"
    )}>
      <div className="flex items-start gap-2 p-2.5">
        {/* eslint-disable-next-line no-restricted-syntax -- no Checkbox component exists yet */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className="mt-1 w-4 h-4 rounded border-border bg-secondary text-primary focus:ring-2 focus:ring-primary/50 cursor-pointer"
          aria-label={t('actions.selectItem', { title: resolution.title })}
        />
        <button
          onClick={onToggle}
          className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors shrink-0"
          aria-label={isExpanded ? t('actions.close') : t('common.view')}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={onView}
          className="flex-1 min-w-0 text-left rounded-md px-1 py-0.5 hover:bg-secondary/50 transition-colors"
        >
          <span className="text-xs font-medium text-foreground block break-words line-clamp-2">
            {resolution.title}
          </span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-2xs text-muted-foreground flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />
              {resolution.issueSignature.type}
            </span>
            <span className="text-2xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {formattedDate}
            </span>
            {successRate !== null && (
              <span className={cn(
                "text-2xs",
                successRate >= 80 ? "text-green-400" :
                successRate >= 50 ? "text-status-warning" : "text-muted-foreground"
              )}>
                {effectiveness.timesSuccessful}/{effectiveness.timesUsed}
              </span>
            )}
            {showSharedBy && resolution.sharedBy && (
              <span className="text-2xs text-blue-400">
                @{resolution.sharedBy}
              </span>
            )}
          </div>
        </button>
      </div>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 border-t border-border/50">
          <div className="mt-2 space-y-2">
            <div className="text-xs text-foreground leading-relaxed break-words">
              {resolution.resolution.summary}
            </div>

            {(resolution.resolution.steps || []).length > 0 && (
              <div className="text-2xs space-y-1">
                <span className="text-muted-foreground">{t('common.steps')}</span>
                <ol className="list-decimal list-inside space-y-0.5 text-foreground">
                  {(resolution.resolution.steps || []).slice(0, 3).map((step, i) => (
                    <li key={i} className="break-words">{step}</li>
                  ))}
                  {(resolution.resolution.steps || []).length > 3 && (
                    <li className="text-muted-foreground">
                      +{(resolution.resolution.steps || []).length - 3} more...
                    </li>
                  )}
                </ol>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onView()
                }}
                className="flex items-center justify-center gap-1 px-2 py-1.5 text-2xs border border-border rounded transition-colors hover:bg-secondary/70"
              >
                {t('common.view')}
              </button>
              {onApply && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onApply()
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-2xs font-medium bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded transition-colors"
                >
                  <CheckCircle className="w-3 h-3" />
                  {t('actions.apply')}
                </button>
              )}
              {canShare && onShare && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onShare()
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-2xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded transition-colors"
                  title={t('share', { defaultValue: 'Share' })}
                >
                  <Share2 className="w-3 h-3" />
                </button>
              )}
              {onExport && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onExport()
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-2xs bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded transition-colors"
                  title={t('common.export')}
                >
                  <Download className="w-3 h-3" />
                </button>
              )}
              {onSubmitToKB && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSubmitToKB()
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-2xs font-medium bg-linear-to-r from-purple-500/20 to-purple-400/20 hover:from-purple-500/30 hover:to-purple-400/30 text-purple-400 border border-purple-500/30 hover:border-purple-400/50 rounded-md shadow-xs shadow-purple-500/10 hover:shadow-purple-500/20 transition-all duration-200"
                  title={t('common.submit')}
                >
                  <BookUp className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="flex items-center justify-center gap-1 px-2 py-1.5 text-2xs rounded transition-colors bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                title={t('actions.delete')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export interface ResolutionDetailPanelProps {
  resolution: Resolution
  onBack: () => void
  onApply?: () => void
  onShare?: () => void
  onExport: () => void
  onSubmitToKB: () => void
}

export function ResolutionDetailPanel({
  resolution,
  onBack,
  onApply,
  onShare,
  onExport,
  onSubmitToKB,
}: ResolutionDetailPanelProps) {
  const { t } = useTranslation()
  const { effectiveness } = resolution
  const successRate = effectiveness.timesUsed > 0
    ? Math.round((effectiveness.timesSuccessful / effectiveness.timesUsed) * 100)
    : null

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col border-b border-border px-4 py-3 sm:px-5 sm:py-4 gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              icon={<ArrowLeft className="w-4 h-4" />}
              className="w-full justify-start sm:w-auto"
            >
              {t('common.back', { defaultValue: 'Back' })}
            </Button>
            <h3 className="text-lg font-semibold text-foreground break-words">{resolution.title}</h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground min-w-0">
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-1 break-words">
            <Tag className="w-3 h-3 shrink-0" />
            <span className="break-words">
              {resolution.issueSignature.type}
              {resolution.issueSignature.resourceKind ? ` (${resolution.issueSignature.resourceKind})` : ''}
            </span>
          </span>
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-1 break-words">
            <Clock className="w-3 h-3 shrink-0" />
            <span className="break-words">{new Date(resolution.createdAt).toLocaleString()}</span>
          </span>
          {successRate !== null && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-1 text-green-400 break-words">
              <CheckCircle className="w-3 h-3 shrink-0" />
              <span className="break-words">{effectiveness.timesSuccessful}/{effectiveness.timesUsed} · {successRate}%</span>
            </span>
          )}
          {resolution.sharedBy && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-1 text-blue-400 break-words">
              <span className="break-words">@{resolution.sharedBy}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex max-h-[calc(100vh-16rem)] min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto scroll-enhanced px-4 py-4 sm:px-5 space-y-5">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">{t('common.summary')}</h4>
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm leading-relaxed text-foreground break-words whitespace-pre-wrap">
              {resolution.resolution.summary}
            </div>
          </section>

          {(resolution.resolution.steps || []).length > 0 && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">{t('common.steps')}</h4>
              <ol className="space-y-2">
                {(resolution.resolution.steps || []).map((step, index) => (
                  <li key={`${resolution.id}-step-${index}`} className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-foreground break-words">
                    <span className="font-medium text-primary mr-2">{index + 1}.</span>
                    <span className="whitespace-pre-wrap break-words">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {resolution.resolution.yaml && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">{t('yaml', { defaultValue: 'YAML' })}</h4>
              <pre className="rounded-lg border border-border bg-background p-4 text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-words max-w-full">
                {resolution.resolution.yaml}
              </pre>
            </section>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:justify-end sm:px-5 sm:py-4">
          {onShare && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onShare}
              icon={<Share2 className="w-3.5 h-3.5" />}
              fullWidth
              className="sm:w-auto"
            >
              {t('share', { defaultValue: 'Share' })}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onExport}
            icon={<Download className="w-3.5 h-3.5" />}
            fullWidth
            className="sm:w-auto"
          >
            {t('common.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSubmitToKB}
            icon={<BookUp className="w-3.5 h-3.5" />}
            fullWidth
            className="sm:w-auto"
          >
            {t('common.submit')}
          </Button>
          {onApply && (
            <Button
              variant="primary"
              size="sm"
              onClick={onApply}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              fullWidth
              className="sm:w-auto"
            >
              {t('actions.apply')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
