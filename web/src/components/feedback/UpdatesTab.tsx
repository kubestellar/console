import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bug, ExternalLink, Loader2, RefreshCw, Search, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContributorBanner } from '../rewards/ContributorLadder'
import { BACKEND_DEFAULT_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import type { CloseRequestInput, ReopenRequestInput } from '../../hooks/useFeatureRequests'
import type { PreviewResult } from './FeatureRequestTypes'
import { cn } from '../../lib/cn'
import { RequestItem } from './UpdatesTabRequestItem'
import { GitHubContributionsSection } from './UpdatesTabGitHubContributionsSection'
import type { UpdatesTabProps } from './UpdatesTab.types'

export function UpdatesTab({
  requests,
  requestsLoading,
  isRefreshing,
  isInDemoMode,
  canPerformActions,
  currentGitHubLogin,
  githubRewards,
  githubPoints,
  token,
  showToast,
  onRefreshRequests,
  onRefreshNotifications,
  onRefreshGitHub,
  isGitHubRefreshing,
  onRequestUpdate,
  onCloseRequest,
  onReopenRequest,
  getUnreadCountForRequest,
  markRequestNotificationsAsRead,
  onShowLoginPrompt,
}: UpdatesTabProps) {
  const { t } = useTranslation()
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [previewChecking, setPreviewChecking] = useState<number | null>(null)
  const [previewResults, setPreviewResults] = useState<Record<number, PreviewResult>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredRequests = (requests || []).filter((request) => {
    if (!normalizedSearchQuery) {
      return true
    }

    const searchableText = `${request.title} ${request.description}`.toLowerCase()
    return searchableText.includes(normalizedSearchQuery)
  })
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (normalizedSearchQuery && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [normalizedSearchQuery])

  const handleRequestUpdate = async (requestId: string) => {
    try {
      setActionLoading(requestId)
      setActionError(null)
      await onRequestUpdate(requestId)
    } catch {
      const errorMessage = 'Failed to request update'
      setActionError(errorMessage)
      showToast(errorMessage, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCloseRequest = async (requestId: string, input?: CloseRequestInput): Promise<boolean> => {
    try {
      setActionLoading(requestId)
      setActionError(null)
      await onCloseRequest(requestId, input)
      setConfirmClose(null)
      return true
    } catch {
      const errorMessage = input?.user_verified ? t('feedback.verifyFixFailed') : t('feedback.closeRequestFailed')
      setActionError(errorMessage)
      showToast(errorMessage, 'error')
      return false
    } finally {
      setActionLoading(null)
    }
  }

  const handleReopenRequest = async (requestId: string, input: ReopenRequestInput) => {
    try {
      setActionLoading(requestId)
      setActionError(null)
      await onReopenRequest(requestId, input)
      showToast(t('feedback.reopenRequestSubmitted'), 'success')
    } catch {
      const errorMessage = t('feedback.reopenRequestFailed')
      setActionError(errorMessage)
      showToast(errorMessage, 'error')
      throw new Error(errorMessage)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheckPreview = async (prNumber: number) => {
    setPreviewChecking(prNumber)

    try {
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`${BACKEND_DEFAULT_URL}/api/feedback/preview/${prNumber}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewResults((previous) => ({ ...previous, [prNumber]: data }))
      } else {
        setPreviewResults((previous) => ({ ...previous, [prNumber]: { status: 'error', message: `HTTP ${response.status}` } }))
      }
    } catch {
      setPreviewResults((previous) => ({ ...previous, [prNumber]: { status: 'error', message: 'Failed to check' } }))
    } finally {
      setPreviewChecking(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {isInDemoMode && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{t('feedback.demoDataBanner')}</span>
        </div>
      )}

      <ContributorBanner />

      <div className="border-b border-border/50 px-3 py-2">
        <a
          href="https://kubestellar.io/leaderboard"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>View Full Leaderboard</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-2 border-b border-border/50 flex items-center justify-between shrink-0">
        {actionError ? <span className="text-xs text-red-400">{actionError}</span> : <span />}
        <button
          onClick={() => {
            setActionError(null)
            onRefreshRequests()
            onRefreshNotifications()
          }}
          disabled={isRefreshing}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
          title={t('common.refresh')}
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="border-b border-border/50 shrink-0">
          <div className="p-2">
            <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
              Your Requests ({normalizedSearchQuery ? `${filteredRequests.length}/${(requests || []).length}` : (requests || []).length})
            </span>
          </div>
          {(requests || []).length > 0 && (
            <div className="px-2 pb-2">
              <label className="relative block">
                <Search className={cn(
                  'pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors',
                  normalizedSearchQuery && 'text-foreground',
                )} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('feedback.searchUpdates')}
                  aria-label={t('feedback.searchUpdates')}
                  className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
          )}
        </div>

        {requestsLoading && (requests || []).length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
            <p className="text-sm">{t('common.loading')}</p>
          </div>
        ) : (requests || []).length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No requests in queue</p>
            <p className="text-xs mt-1">Submit a bug report or feature request to get started</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('feedback.noMatchingRequests')}</p>
          </div>
        ) : (
          filteredRequests.map((request) => (
            <RequestItem
              key={request.id}
              request={request}
              currentGitHubLogin={currentGitHubLogin}
              canPerformActions={canPerformActions}
              actionLoading={actionLoading}
              confirmClose={confirmClose}
              previewChecking={previewChecking}
              previewResults={previewResults}
              getUnreadCountForRequest={getUnreadCountForRequest}
              markRequestNotificationsAsRead={markRequestNotificationsAsRead}
              onRequestUpdate={handleRequestUpdate}
              onCloseRequest={handleCloseRequest}
              onReopenRequest={handleReopenRequest}
              onSetConfirmClose={setConfirmClose}
              onCheckPreview={handleCheckPreview}
              onShowLoginPrompt={onShowLoginPrompt}
            />
          ))
        )}

        <GitHubContributionsSection
          currentGitHubLogin={currentGitHubLogin}
          githubRewards={githubRewards}
          githubPoints={githubPoints}
          isGitHubRefreshing={isGitHubRefreshing}
          onRefreshGitHub={onRefreshGitHub}
          requests={requests}
          requestsLoading={requestsLoading}
        />
      </div>
    </div>
  )
}
