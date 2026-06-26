import { Loader2, Pencil } from 'lucide-react'
import { Button } from '../ui/Button'
import { useTranslation } from 'react-i18next'
import { REWARD_ACTIONS } from '../../types/rewards'
import { MIN_DRAFT_LENGTH } from './FeatureRequestTypes'
import { Save } from 'lucide-react'
import type { RequestType, SuccessState, TabType } from './FeatureRequestTypes'

interface SubmitFooterProps {
  activeTab: TabType
  success: SuccessState | null
  description: string
  isSubmitting: boolean
  canPerformActions: boolean
  feedbackTokenMissing: boolean
  editingDraftId: string | null
  requestType: RequestType
  onClose: () => void
  onSaveDraft: () => void
  onShowLoginPrompt: () => void
  onSetActiveTab: (tab: TabType) => void
}

export function SubmitFooter({
  activeTab,
  success,
  description,
  isSubmitting,
  canPerformActions,
  feedbackTokenMissing,
  editingDraftId,
  requestType,
  onClose,
  onSaveDraft,
  onShowLoginPrompt,
  onSetActiveTab,
}: SubmitFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2">
      {activeTab === 'submit' && !success ? (
        <>
          <Button
            variant="secondary"
            size="lg"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="border border-border"
          >
            Cancel
          </Button>
          {description.trim().length >= MIN_DRAFT_LENGTH && (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={isSubmitting}
              className="px-3 py-2 text-sm rounded-lg border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title={editingDraftId ? 'Update saved draft' : 'Save as draft for later'}
            >
              <Save className="w-3.5 h-3.5" />
              {editingDraftId ? 'Update Draft' : 'Save Draft'}
            </button>
          )}
          {canPerformActions ? (
            <button
              type="submit"
              form="feedback-form"
              disabled={isSubmitting || feedbackTokenMissing}
              title={feedbackTokenMissing ? 'FEEDBACK_GITHUB_TOKEN is not configured — set it in .env or Settings' : undefined}
              className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('feedback.submitting')}
                </>
              ) : (
                <>
                  Submit
                  <span className="text-white/60 text-xs font-normal">
                    +{requestType === 'bug' ? REWARD_ACTIONS.bug_report.coins : REWARD_ACTIONS.feature_suggestion.coins}
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onShowLoginPrompt}
              className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center gap-2"
              title="Please login to submit feedback"
            >
              Login to Submit
            </button>
          )}
        </>
      ) : activeTab === 'drafts' ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSetActiveTab('submit')}
            className="px-3 py-2 text-sm rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            New Report
          </button>
          <Button
            variant="secondary"
            size="lg"
            type="button"
            onClick={onClose}
            className="border border-border"
          >
            Close
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          type="button"
          onClick={onClose}
          className="border border-border"
        >
          Close
        </Button>
      )}
    </div>
  )
}
