import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getStatusDescription, type FeatureRequest } from '../../hooks/useFeatureRequests'
import { ExternalLinkRow } from './UpdatesTabRequestLinks'
import type { RequestStatusInfo } from './UpdatesTab.types'

export function UntriagedRequestContent({
  request,
  isOwnedByUser,
  statusInfo,
}: {
  request: FeatureRequest
  isOwnedByUser: boolean
  statusInfo: RequestStatusInfo
}) {
  return isOwnedByUser ? (
    <>
      <p className="text-sm font-medium text-foreground mt-1 truncate blur-xs select-none">
        {request.request_type === 'bug' ? '🐛 ' : '✨ '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.github_issue_url && (
          <ExternalLinkRow href={request.github_issue_url} colorClass="text-purple-400 hover:text-purple-300">
            <ExternalLink className="w-3 h-3" />
            View on GitHub
          </ExternalLinkRow>
        )}
      </div>
      <p className="text-xs text-muted-foreground italic mt-1.5">
        Details will be visible to you once we accept triage
      </p>
    </>
  ) : (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
      <span className="text-xs text-muted-foreground italic">Awaiting maintainer attention</span>
      {request.github_issue_number && <span className="text-xs text-muted-foreground">#{request.github_issue_number}</span>}
      {request.github_issue_url && (
        <ExternalLinkRow href={request.github_issue_url} colorClass="text-purple-400 hover:text-purple-300">
          <ExternalLink className="w-3 h-3" />
          View on GitHub
        </ExternalLinkRow>
      )}
    </div>
  )
}

export function TriagedRequestContent({
  request,
  shouldBlur,
  statusInfo,
  isAwaitingVerification,
}: {
  request: FeatureRequest
  shouldBlur: boolean
  statusInfo: RequestStatusInfo
  isAwaitingVerification: boolean
}) {
  const { t } = useTranslation()

  return (
    <>
      <p className={`text-sm font-medium text-foreground mt-1 truncate ${shouldBlur ? 'blur-xs select-none' : ''}`}>
        {request.request_type === 'bug' ? '🐛 ' : '✨ '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.status === 'fix_complete' && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-muted text-muted-foreground">
            Closed
          </span>
        )}
        {isAwaitingVerification && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-blue-500/20 text-blue-300">
            {t('feedback.awaitingVerificationBadge')}
          </span>
        )}
        {getStatusDescription(request.status, request.closed_by_user) && (
          <span className={`text-xs text-muted-foreground ${shouldBlur ? 'blur-xs select-none' : ''}`}>
            {getStatusDescription(request.status, request.closed_by_user)}
          </span>
        )}
      </div>
    </>
  )
}
