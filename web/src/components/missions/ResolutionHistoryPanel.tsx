/**
 * Resolution History Panel
 *
 * Shows all saved resolutions (personal and shared) with ability to view, delete, and share.
 * Displayed in the fullscreen mission view sidebar.
 */

import { useState } from 'react'
import {
  BookMarked,
  Star,
  Building2,
  ChevronDown,
  ChevronRight,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import { useResolutions, type Resolution } from '../../hooks/useResolutions'
import { ShareMissionDialog } from './ShareMissionDialog'
import { SubmitToKBDialog } from './SubmitToKBDialog'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../../lib/modals'
import { ResolutionCard, ResolutionDetailPanel } from './ResolutionHistoryPanel.parts'

interface ResolutionHistoryPanelProps {
  onApplyResolution?: (resolution: Resolution) => void
}

export function ResolutionHistoryPanel({ onApplyResolution }: ResolutionHistoryPanelProps) {
  const { t } = useTranslation()
  const { resolutions, sharedResolutions, deleteResolution, shareResolution } = useResolutions()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showPersonal, setShowPersonal] = useState(true)
  const [showShared, setShowShared] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [exportResolution, setExportResolution] = useState<Resolution | null>(null)
  const [submitKBResolution, setSubmitKBResolution] = useState<Resolution | null>(null)
  const [viewingResolution, setViewingResolution] = useState<Resolution | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
    setConfirmClearAll(false)
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
    setConfirmBulkDelete(false)
    for (const id of selectedIds) {
      deleteResolution(id)
    }
    setSelectedIds(new Set())
    setExpandedId(null)
  }

  const handleDeleteClick = (id: string) => {
    setDeleteTarget(id)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return

    deleteResolution(deleteTarget)
    setDeleteTarget(null)
    setExpandedId(null)
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(deleteTarget)
      return next
    })
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
            {t('resolutionHistory')}
          </h4>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground mb-1">
              {t('noSavedResolutions')}
            </p>
            <p className="text-2xs text-muted-foreground/70">
              {t('resolutionHistoryPanel.emptyStateHint')}
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
                {t('resolutionHistoryPanel.savedCount', { count: totalResolutions })}
              </span>
            </h4>
            <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
              {selectedIds.size > 0 && (
                <>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmBulkDelete(true)}
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
                    onClick={() => setConfirmClearAll(true)}
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
                {t('yourResolutions')} ({resolutions.length})
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
                      onDelete={() => handleDeleteClick(resolution.id)}
                      onShare={() => handleShare(resolution.id)}
                      onExport={() => setExportResolution(resolution)}
                      onSubmitToKB={() => setSubmitKBResolution(resolution)}
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
                {t('teamShared')} ({sharedResolutions.length})
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
                      onDelete={() => handleDeleteClick(resolution.id)}
                      onExport={() => setExportResolution(resolution)}
                      onSubmitToKB={() => setSubmitKBResolution(resolution)}
                      showSharedBy
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={t('resolutionHistoryPanel.deleteTitle')}
        message={t('resolutionHistoryPanel.deleteMessage')}
        confirmLabel={t('resolutionHistoryPanel.deleteConfirmLabel')}
        cancelLabel={t('actions.cancel')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={handleDeleteSelected}
        title={t('resolutionHistoryPanel.deleteSelectedTitle')}
        message={t('resolutionHistoryPanel.deleteSelectedMessage', { count: selectedIds.size })}
        confirmLabel={t('resolutionHistoryPanel.deleteSelectedConfirmLabel')}
        cancelLabel={t('actions.cancel')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={confirmClearAll}
        onClose={() => setConfirmClearAll(false)}
        onConfirm={handleClearAll}
        title={t('resolutionHistoryPanel.clearAllTitle')}
        message={t('resolutionHistoryPanel.clearAllMessage')}
        confirmLabel={t('resolutionHistoryPanel.clearAllConfirmLabel')}
        cancelLabel={t('actions.cancel')}
        variant="danger"
      />

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

