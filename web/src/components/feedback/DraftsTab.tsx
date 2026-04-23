import { Clock, FileText, RotateCcw, Trash2 } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { formatRelativeTime } from './FeatureRequestTypes'
import type { FeedbackDraft, TabType } from './FeatureRequestTypes'
import { extractDraftTitle } from '../../hooks/useFeedbackDrafts'

interface DraftsTabProps {
  drafts: FeedbackDraft[]
  draftCount: number
  editingDraftId: string | null
  confirmDeleteDraft: string | null
  showClearAllDrafts: boolean
  onSetActiveTab: (tab: TabType) => void
  onRestoreDraft: (draft: FeedbackDraft) => void
  onDeleteDraft: (id: string) => void
  onSetConfirmDeleteDraft: (id: string | null) => void
  onSetShowClearAllDrafts: (show: boolean) => void
  onClearAllDrafts: () => void
  showToast: (message: string, type: 'success' | 'error') => void
}

export function DraftsTab({
  drafts,
  draftCount,
  editingDraftId,
  confirmDeleteDraft,
  showClearAllDrafts,
  onSetActiveTab,
  onRestoreDraft,
  onDeleteDraft,
  onSetConfirmDeleteDraft,
  onSetShowClearAllDrafts,
  onClearAllDrafts,
  showToast,
}: DraftsTabProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Drafts header */}
      <div className="p-2 border-b border-border/50 flex items-center justify-between shrink-0">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
          Saved Drafts ({draftCount})
        </span>
        {draftCount > 1 && (
          showClearAllDrafts ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Delete all?</span>
              <button
                onClick={() => { onClearAllDrafts(); onSetShowClearAllDrafts(false); showToast('All drafts deleted', 'success') }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => onSetShowClearAllDrafts(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => onSetShowClearAllDrafts(true)}
              className="text-xs text-muted-foreground hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          )
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {draftCount === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No saved drafts</p>
            <p className="text-xs mt-1">
              Save your work-in-progress bug reports and feature requests here
            </p>
            <button
              onClick={() => onSetActiveTab('submit')}
              className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              Start writing a new report
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
                className={`p-3 border-b border-border/50 hover:bg-secondary/30 transition-colors ${
                  isEditing ? 'bg-purple-500/5 border-l-2 border-l-purple-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${
                        draft.requestType === 'bug' ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {draft.requestType === 'bug' ? 'Bug' : 'Feature'}
                      </span>
                      <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${
                        draft.targetRepo === 'docs' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {draft.targetRepo === 'docs' ? 'Docs' : 'Console'}
                      </span>
                      {isEditing && (
                        <StatusBadge color="purple" size="xs">Editing</StatusBadge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1 truncate">
                      {draft.requestType === 'bug' ? 'Bug: ' : 'Feature: '}{title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Saved {formatRelativeTime(draft.updatedAt)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                      {isConfirmingDelete ? (
                        <>
                          <span className="text-xs text-muted-foreground">Delete this draft?</span>
                          <button
                            onClick={() => onDeleteDraft(draft.id)}
                            className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => onSetConfirmDeleteDraft(null)}
                            className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onRestoreDraft(draft)}
                            className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {isEditing ? 'Reload' : 'Edit'}
                          </button>
                          <button
                            onClick={() => onSetConfirmDeleteDraft(draft.id)}
                            className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
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
      </div>
    </div>
  )
}
