/**
 * Resolution History Panel
 *
 * Shows all saved resolutions (personal and shared) with ability to view, delete, and share.
 * Displayed in the fullscreen mission view sidebar.
 */

import { useState, useEffect, useRef } from 'react'
import {
  BookMarked,
  BookUp,
  Star,
  Building2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Share2,
  Download,
  CheckCircle,
  Clock,
  Tag,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react'
import { useResolutions, type Resolution } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'
import { ShareMissionDialog } from './ShareMissionDialog'
import { SubmitToKBDialog } from './SubmitToKBDialog'
import { useTranslation } from 'react-i18next'
import { DELETE_CONFIRM_TIMEOUT_MS } from '../../lib/constants/network'
import { Button } from '../ui/Button'

interface ResolutionHistoryPanelProps {
  onApplyResolution?: (resolution: Resolution) => void
}

export function ResolutionHistoryPanel({ onApplyResolution }: ResolutionHistoryPanelProps) {
  const { t } = useTranslation()
  const { resolutions, sharedResolutions, deleteResolution, shareResolution } = useResolutions()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showPersonal, setShowPersonal] = useState(true)
  const [showShared, setShowShared] = useState(true)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [exportResolution, setExportResolution] = useState<Resolution | null>(null)
  const [submitKBResolution, setSubmitKBResolution] = useState<Resolution | null>(null)
  const [viewingResolution, setViewingResolution] = useState<Resolution | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(deleteConfirmTimerRef.current)
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    const allIds = new Set<string>()
    for (const resolution of (resolutions || [])) {
      allIds.add(resolution.id)
    }
    for (const resolution of (sharedResolutions || [])) {
      allIds.add(resolution.id)
    }
    setSelectedIds(allIds)
  }

  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleClearAll = () => {
    for (const resolution of (resolutions || [])) {
      deleteResolution(resolution.id)
    }
    for (const resolution of (sharedResolutions || [])) {
      deleteResolution(resolution.id)
    }
    setSelectedIds(new Set())
    setExpandedId(null)
  }

  const handleDeleteSelected = () => {
    for (const id of selectedIds) {
      deleteResolution(id)
    }
    setSelectedIds(new Set())
    setExpandedId(null)
  }

  const handleDelete = (id: string) => {
    if (deleteConfirmId === id) {
      deleteResolution(id)
      setDeleteConfirmId(null)
      setExpandedId(null)
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } else {
      setDeleteConfirmId(id)
      // Auto-clear confirm after 3s
      clearTimeout(deleteConfirmTimerRef.current)
      deleteConfirmTimerRef.current = setTimeout(() => setDeleteConfirmId(prev => prev === id ? null : prev), DELETE_CONFIRM_TIMEOUT_MS)
    }
  }

  const handleShare = (id: string) => {
    shareResolution(id)
  }

  const totalResolutions = resolutions.length + sharedResolutions.length

  if (totalResolutions === 0) {
    return (
      <div className="min-w-0 flex flex-col gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-purple-400" />
            {t('common.resolutionHistory')}
          </h4>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground mb-1">
              No saved resolutions yet
            </p>
            <p className="text-2xs text-muted-foreground/70">
              Complete a mission and save the resolution to build your knowledge base
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex flex-col gap-4">
      {viewingResolution ? (
        <ResolutionDetailPanel
          resolution={viewingResolution}
          onBack={() => setViewingResolution(null)}
          onApply={onApplyResolution ? () => {
            onApplyResolution(viewingResolution)
            setViewingResolution(null)
          } : undefined}
          onShare={viewingResolution.visibility === 'private' ? () => handleShare(viewingResolution.id) : undefined}
          onExport={() => setExportResolution(viewingResolution)}
          onSubmitToKB={() => setSubmitKBResolution(viewingResolution)}
        />
      ) : (
        <div className="min-w-0 bg-card border border-border rounded-lg p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 min-w-0">
              <BookMarked className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="min-w-0 break-words">{t('navigation.history')}</span>
              <span className="text-xs text-muted-foreground font-normal shrink-0">
                {totalResolutions} saved
              </span>
            </h4>
            <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
              {selectedIds.size > 0 && (
                <>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteSelected}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    {t('actions.deleteSelected')} ({selectedIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                  >
                    {t('actions.deselectAll')}
                  </Button>
                </>
              )}
              {selectedIds.size === 0 && totalResolutions > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {t('actions.selectAll')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleClearAll}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    {t('actions.clearAll')}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Personal Resolutions */}
          {resolutions.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowPersonal(!showPersonal)}
                className="w-full flex items-center gap-2 text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors"
              >
                {showPersonal ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Star className="w-3.5 h-3.5 text-yellow-400" />
                Your Resolutions ({resolutions.length})
              </button>
              {showPersonal && (
                <div className="space-y-2">
                  {(resolutions || []).map(resolution => (
                    <ResolutionCard
                      key={resolution.id}
                      resolution={resolution}
                      isExpanded={expandedId === resolution.id}
                      isSelected={selectedIds.has(resolution.id)}
                      onToggle={() => toggleExpand(resolution.id)}
                      onToggleSelect={() => toggleSelect(resolution.id)}
                      onView={() => setViewingResolution(resolution)}
                      onApply={onApplyResolution ? () => onApplyResolution(resolution) : undefined}
                      onDelete={() => handleDelete(resolution.id)}
                      onShare={() => handleShare(resolution.id)}
                      onExport={() => setExportResolution(resolution)}
                      onSubmitToKB={() => setSubmitKBResolution(resolution)}
                      isDeleteConfirm={deleteConfirmId === resolution.id}
                      canShare
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Shared Resolutions */}
          {sharedResolutions.length > 0 && (
            <div>
              <button
                onClick={() => setShowShared(!showShared)}
                className="w-full flex items-center gap-2 text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors"
              >
                {showShared ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                Team Shared ({sharedResolutions.length})
              </button>
              {showShared && (
                <div className="space-y-2">
                  {(sharedResolutions || []).map(resolution => (
                    <ResolutionCard
                      key={resolution.id}
                      resolution={resolution}
                      isExpanded={expandedId === resolution.id}
                      isSelected={selectedIds.has(resolution.id)}
                      onToggle={() => toggleExpand(resolution.id)}
                      onToggleSelect={() => toggleSelect(resolution.id)}
                      onView={() => setViewingResolution(resolution)}
                      onApply={onApplyResolution ? () => onApplyResolution(resolution) : undefined}
                      onDelete={() => handleDelete(resolution.id)}
                      onExport={() => setExportResolution(resolution)}
                      onSubmitToKB={() => setSubmitKBResolution(resolution)}
                      isDeleteConfirm={deleteConfirmId === resolution.id}
                      showSharedBy
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Export dialog */}
      {exportResolution && (
        <ShareMissionDialog
          resolution={exportResolution}
          isOpen={true}
          onClose={() => setExportResolution(null)}
        />
      )}

      {/* Submit to KB dialog */}
      {submitKBResolution && (
        <SubmitToKBDialog
          resolution={submitKBResolution}
          isOpen={true}
          onClose={() => setSubmitKBResolution(null)}
        />
      )}
    </div>
  )
}

interface ResolutionCardProps {
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
  isDeleteConfirm: boolean
  showSharedBy?: boolean
  canShare?: boolean
}

function ResolutionCard({
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
  isDeleteConfirm,
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
                successRate >= 50 ? "text-yellow-400" : "text-muted-foreground"
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
                className={cn(
                  "flex items-center justify-center gap-1 px-2 py-1.5 text-2xs rounded transition-colors",
                  isDeleteConfirm
                    ? "bg-red-500 text-white"
                    : "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                )}
                title={isDeleteConfirm ? t('common.confirm') : t('actions.delete')}
              >
                <Trash2 className="w-3 h-3" />
                {isDeleteConfirm && <span>{t('common.confirm')}</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ResolutionDetailPanelProps {
  resolution: Resolution
  onBack: () => void
  onApply?: () => void
  onShare?: () => void
  onExport: () => void
  onSubmitToKB: () => void
}

function ResolutionDetailPanel({
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
