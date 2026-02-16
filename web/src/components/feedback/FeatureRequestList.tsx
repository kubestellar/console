import { useState } from 'react'
import {
  Bug,
  Sparkles,
  ExternalLink,
  GitPullRequest,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Clock,
  RefreshCw,
} from 'lucide-react'
import {
  useFeatureRequests,
  STATUS_LABELS,
  STATUS_COLORS,
  type FeatureRequest,
  type FeedbackType,
} from '../../hooks/useFeatureRequests'
import { useTranslation } from 'react-i18next'

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

interface RequestCardProps {
  request: FeatureRequest
  onFeedback: (requestId: string, type: FeedbackType, comment?: string) => Promise<void>
}

function RequestCard({ request, onFeedback }: RequestCardProps) {
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  const handleFeedback = async (type: FeedbackType) => {
    setIsSubmittingFeedback(true)
    setFeedbackError(null)
    try {
      await onFeedback(request.id, type)
    } catch {
      setFeedbackError('Failed to submit feedback')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  return (
    <div className="p-4 bg-background border border-border rounded-lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {request.request_type === 'bug' ? (
            <Bug className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate">
              {request.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {request.description}
            </p>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 text-xs rounded-full text-white flex-shrink-0 ${
            STATUS_COLORS[request.status]
          }`}
        >
          {STATUS_LABELS[request.status]}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(request.created_at)}
        </span>
        {request.github_issue_url && (
          <a
            href={request.github_issue_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-purple-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Issue #{request.github_issue_number}
          </a>
        )}
        {request.pr_url && (
          <a
            href={request.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-purple-400 transition-colors"
          >
            <GitPullRequest className="w-3 h-3" />
            PR #{request.pr_number}
          </a>
        )}
      </div>

      {/* Preview & Feedback */}
      {request.netlify_preview_url && (
        <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Preview Available</span>
            </div>
            <a
              href={request.netlify_preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 text-xs rounded bg-green-500 hover:bg-green-600 text-white transition-colors flex items-center gap-1"
            >
              View Preview
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Feedback buttons */}
          <div className="mt-3 pt-3 border-t border-green-500/30">
            <p className="text-xs text-muted-foreground mb-2">
              Does this fix work for you?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFeedback('positive')}
                disabled={isSubmittingFeedback}
                className="px-3 py-1.5 text-xs rounded bg-secondary hover:bg-green-500/20 text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {isSubmittingFeedback ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ThumbsUp className="w-3 h-3" />
                )}
                Looks Good
              </button>
              <button
                onClick={() => handleFeedback('negative')}
                disabled={isSubmittingFeedback}
                className="px-3 py-1.5 text-xs rounded bg-secondary hover:bg-red-500/20 text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {isSubmittingFeedback ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ThumbsDown className="w-3 h-3" />
                )}
                Needs Work
              </button>
            </div>
            {feedbackError && (
              <p className="text-xs text-red-400 mt-1">{feedbackError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function FeatureRequestList() {
  const { t } = useTranslation()
  const { requests, isLoading, error, loadRequests, submitFeedback } = useFeatureRequests()

  const handleFeedback = async (requestId: string, type: FeedbackType, comment?: string) => {
    await submitFeedback(requestId, { feedback_type: type, comment })
  }

  if (isLoading && requests.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
        <p className="text-sm">Loading requests...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-400 mb-2">{error}</p>
        <button
          onClick={() => loadRequests()}
          className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No requests yet</p>
        <p className="text-xs mt-1">
          Submit a bug report or feature request to get started
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Your Requests</h3>
        <button
          onClick={() => loadRequests()}
          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground"
          title={t('common.refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Request List */}
      <div className="space-y-2">
        {requests.map(request => (
          <RequestCard
            key={request.id}
            request={request}
            onFeedback={handleFeedback}
          />
        ))}
      </div>
    </div>
  )
}
