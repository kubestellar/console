import type { ReactNode } from 'react'
import { Check, ExternalLink, GitPullRequest } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { getStatusDescription } from '../../hooks/useFeatureRequests'
import type { FeatureRequest } from '../../hooks/useFeatureRequests'
import type { RequestStatusInfo } from './UpdatesTab.types'

export function ExternalLinkRow({
  href,
  colorClass,
  compact = false,
  children,
}: {
  href: string
  colorClass: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <a
      href={sanitizeUrl(href)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${compact ? 'text-xs text-muted-foreground hover:text-foreground' : 'text-xs flex items-center gap-1 mt-1.5'} ${colorClass} flex items-center gap-1`}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  )
}

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

export function FixCompleteBanner({
  request,
  isAwaitingVerification,
  isVerified,
}: {
  request: FeatureRequest
  isAwaitingVerification: boolean
  isVerified: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold text-green-400">{t('feedback.fixMerged')}</span>
        </div>
        {isVerified && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-green-500/20 text-green-300">
            {t('feedback.verifiedByYou')}
          </span>
        )}
        {isAwaitingVerification && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-blue-500/20 text-blue-300">
            {t('feedback.awaitingVerificationBadge')}
          </span>
        )}
      </div>
      <p className="text-xs text-green-300/80 mb-2">
        {isVerified
          ? t('feedback.verificationRecorded')
          : t('feedback.fixMergedDescription', {
            requestType: request.request_type === 'bug'
              ? t('feedback.requestTypeBugFix')
              : t('feedback.requestTypeFeature'),
          })}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <ExternalLinkRow href="https://github.com/kubestellar/console/releases" colorClass="text-green-400 hover:text-green-300">
          <ExternalLink className="w-3 h-3" />
          {t('feedback.releases')}
        </ExternalLinkRow>
        {request.pr_url && (
          <ExternalLinkRow href={request.pr_url} colorClass="text-green-400 hover:text-green-300">
            <GitPullRequest className="w-3 h-3" />
            PR #{request.pr_number}
          </ExternalLinkRow>
        )}
        {request.github_issue_url && (
          <ExternalLinkRow href={request.github_issue_url} colorClass="text-green-400 hover:text-green-300">
            <ExternalLink className="w-3 h-3" />
            Issue #{request.github_issue_number}
          </ExternalLinkRow>
        )}
      </div>
    </div>
  )
}
