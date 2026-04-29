import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Clock, FileText, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { formatRelativeTime } from './FeatureRequestTypes'
import type { FeedbackDraft, TabType } from './FeatureRequestTypes'
import { extractDraftTitle } from '../../hooks/useFeedbackDrafts'
import { cn } from '../../lib/cn'

interface DraftsTabProps {
  drafts: FeedbackDraft[]
  draftCount: number
  recentlyDeletedDrafts: FeedbackDraft[]
  recentlyDeletedCount: number
  editingDraftId: string | null
  confirmDeleteDraft: string | null
  showClearAllDrafts: boolean
  onSetActiveTab: (tab: TabType) => void
  onRestoreDraft: (draft: FeedbackDraft) => void
  onDeleteDraft: (id: string) => void
  onPermanentlyDeleteDraft: (id: string) => void
  onRestoreDeletedDraft: (id: string) => void
  onEmptyRecentlyDeleted: () => void
  onSetConfirmDeleteDraft: (id: string | null) => void
  onSetShowClearAllDrafts: (show: boolean) => void
  onClearAllDrafts: () => void
  showToast: (message: string, type: 'success' | 'error') => void
}

export function DraftsTab({
  drafts,
  draftCount,
  recentlyDeletedDrafts,
  recentlyDeletedCount,
  editingDraftId,
  confirmDeleteDraft,
  showClearAllDrafts,
  onSetActiveTab,
  onRestoreDraft,
  onDeleteDraft,
  onPermanentlyDeleteDraft,
  onRestoreDeletedDraft,
  onEmptyRecentlyDeleted,
  onSetConfirmDeleteDraft,
  onSetShowClearAllDrafts,
  onClearAllDrafts,
  showToast,
}: DraftsTabProps) {
  const { t } = useTranslation()
  const [recentlyDeletedOpen, setRecentlyDeletedOpen] = useState(false)
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<string | null>(null)
  const [showEmptyAllConfirm, setShowEmptyAllConfirm] = useState(false)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Drafts header */}
      <div className="p-2 border-b border-border/50 flex items-center justify-between shrink-0">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('drafts.savedDrafts', 'Saved Drafts')} ({draftCount})
        </span>
        {draftCount > 1 && (
          showClearAllDrafts ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t('drafts.deleteAllConfirm', 'Delete all?')}</span>
              <button
                onClick={() => { onClearAllDrafts(); onSetShowClearAllDrafts(false); showToast(t('drafts.allDraftsDeleted', 'All drafts deleted'), 'success') }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                {t('drafts.confirm', 'Confirm')}
              </button>
              <button
                onClick={() => onSetShowClearAllDrafts(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('drafts.cancel', 'Cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => onSetShowClearAllDrafts(true)}
              className="text-xs text-muted-foreground hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              {t('drafts.clearAll', 'Clear All')}
            </button>
          )
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {draftCount === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('drafts.noSavedDrafts', 'No saved drafts')}</p>
            <p className="text-xs mt-1">
              {t('drafts.saveWorkInProgress', 'Save your work-in-progress bug reports and feature requests here')}
            </p>
            <button
              onClick={() => onSetActiveTab('submit')}
              className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              {t('drafts.startNewReport', 'Start writing a new report')}
            </button>
          </div>
        ) : (
          [...drafts].reverse().map(draft => {
            const title = extractDraftTitle(draft.description)
            const isEditing = editingDraftId === draft.id
            const isConfirmingDelete = confirmDeleteDraft === draft.id
            return (
              <div
                key={draft.id}
                role="button"
                tabIndex={0}
                onClick={() => onRestoreDraft(draft)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRestoreDraft(draft) } }}
                className={cn(
                  'p-3 border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer',
                  isEditing && 'bg-purple-500/5 border-l-2 border-l-purple-500',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        'px-1.5 py-0.5 text-2xs font-medium rounded',
                        draft.requestType === 'bug' ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400',
                      )}>
                        {draft.requestType === 'bug' ? t('drafts.typeBug', 'Bug') : t('drafts.typeFeature', 'Feature')}
                      </span>
                      <span className={cn(
                        'px-1.5 py-0.5 text-2xs font-medium rounded',
                        draft.targetRepo === 'docs' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400',
                      )}>
                        {draft.targetRepo === 'docs' ? t('drafts.repoDocs', 'Docs') : t('drafts.repoConsole', 'Console')}
                      </span>
                      {isEditing && (
                        <StatusBadge color="purple" size="xs">{t('drafts.editing', 'Editing')}</StatusBadge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1 truncate">
                      {draft.requestType === 'bug' ? 'Bug: ' : 'Feature: '}{title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t('drafts.saved', 'Saved')} {formatRelativeTime(draft.updatedAt)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div role="group" className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      {isConfirmingDelete ? (
                        <>
                          <span className="text-xs text-muted-foreground">{t('drafts.deleteThisDraft', 'Delete this draft?')}</span>
                          <button
                            onClick={() => onDeleteDraft(draft.id)}
                            className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                          >
                            {t('drafts.confirm', 'Confirm')}
                          </button>
                          <button
                            onClick={() => onSetConfirmDeleteDraft(null)}
                            className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
                          >
                            {t('drafts.cancel', 'Cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onRestoreDraft(draft)}
                            className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {isEditing ? t('drafts.reload', 'Reload') : t('drafts.edit', 'Edit')}
                          </button>
                          <button
                            onClick={() => onSetConfirmDeleteDraft(draft.id)}
                            className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('drafts.delete', 'Delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Recently Deleted Section */}
        {recentlyDeletedCount > 0 && (
          <div className="border-t border-border/50">
            <button
              onClick={() => setRecentlyDeletedOpen(prev => !prev)}
              className="w-full p-2 flex items-center justify-between text-muted-foreground hover:bg-secondary/20 transition-colors"
            >
              <span className="text-2xs font-medium uppercase tracking-wider flex items-center gap-1">
                {recentlyDeletedOpen
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />}
                {t('drafts.recentlyDeleted', 'Recently Deleted')} ({recentlyDeletedCount})
              </span>
              {recentlyDeletedOpen && (
                showEmptyAllConfirm ? (
                  <span role="group" className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <span className="text-xs text-muted-foreground">{t('drafts.emptyAllConfirm', 'Remove all?')}</span>
                    <button
                      onClick={() => { onEmptyRecentlyDeleted(); setShowEmptyAllConfirm(false); showToast(t('drafts.permanentlyDeletedAll', 'All deleted drafts removed'), 'success') }}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors min-h-11 min-w-11"
                    >
                      {t('drafts.confirm', 'Confirm')}
                    </button>
                    <button
                      onClick={() => setShowEmptyAllConfirm(false)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors min-h-11 min-w-11"
                    >
                      {t('drafts.cancel', 'Cancel')}
                    </button>
                  </span>
                ) : (
                  /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
                  <span
                    className="text-xs text-muted-foreground hover:text-red-400 flex items-center gap-1 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setShowEmptyAllConfirm(true) }}
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('drafts.emptyAll', 'Empty All')}
                  </span>
                )
              )}
            </button>

            {recentlyDeletedOpen && (
              <div className="bg-secondary/10">
                {[...recentlyDeletedDrafts].reverse().map(draft => {
                  const title = extractDraftTitle(draft.description)
                  const isConfirmingPermanent = confirmPermanentDelete === draft.id
                  return (
                    <div
                      key={draft.id}
                      className="p-3 border-b border-border/30 opacity-70"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              'px-1.5 py-0.5 text-2xs font-medium rounded',
                              draft.requestType === 'bug' ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400',
                            )}>
                              {draft.requestType === 'bug' ? t('drafts.typeBug', 'Bug') : t('drafts.typeFeature', 'Feature')}
                            </span>
                            <span className={cn(
                              'px-1.5 py-0.5 text-2xs font-medium rounded',
                              draft.targetRepo === 'docs' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400',
                            )}>
                              {draft.targetRepo === 'docs' ? t('drafts.repoDocs', 'Docs') : t('drafts.repoConsole', 'Console')}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground mt-1 truncate line-through">
                            {draft.requestType === 'bug' ? 'Bug: ' : 'Feature: '}{title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {t('drafts.lastEdited', 'Last edited')} {formatRelativeTime(draft.updatedAt)}
                            </span>
                            {draft.deletedAt && (
                              <span className="text-xs text-red-400/70 flex items-center gap-1">
                                <Trash2 className="w-3 h-3" />
                                {t('drafts.deletedTime', 'Deleted')} {formatRelativeTime(draft.deletedAt)}
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                            {isConfirmingPermanent ? (
                              <>
                                <span className="text-xs text-muted-foreground">{t('drafts.permanentDeleteConfirm', 'Delete permanently?')}</span>
                                <button
                                  onClick={() => { onPermanentlyDeleteDraft(draft.id); setConfirmPermanentDelete(null); showToast(t('drafts.permanentlyDeleted', 'Draft permanently deleted'), 'success') }}
                                  className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                                >
                                  {t('drafts.confirm', 'Confirm')}
                                </button>
                                <button
                                  onClick={() => setConfirmPermanentDelete(null)}
                                  className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
                                >
                                  {t('drafts.cancel', 'Cancel')}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => { onRestoreDeletedDraft(draft.id); showToast(t('drafts.draftRestored', 'Draft restored'), 'success') }}
                                  className="px-2 py-1 text-xs rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors flex items-center gap-1"
                                >
                                  <Undo2 className="w-3 h-3" />
                                  {t('drafts.restore', 'Restore')}
                                </button>
                                <button
                                  onClick={() => setConfirmPermanentDelete(draft.id)}
                                  className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  {t('drafts.deletePermanently', 'Delete Permanently')}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
