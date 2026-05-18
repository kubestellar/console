import type { WheelEvent } from 'react'
import { buildGitHubIssueUrl } from '@/lib/githubUrls'
import { MAX_TITLE_LENGTH } from './FeatureRequestTypes'
import type { TargetRepo } from './FeatureRequestTypes'

export const MIN_PARENT_ISSUE_NUMBER = 1
export const MAX_AGENT_CONNECTION_LOG_LINES = 10
export const ALL_CLUSTERS_CONTEXT_LABEL = 'all clusters'
export const DESCRIPTION_EDITOR_HEIGHT_CLASS = 'h-56'
export const DESCRIPTION_EXAMPLE_MAX_HEIGHT_CLASS = 'max-h-56'
export const SCROLL_EDGE_TOLERANCE_PX = 1

export type SubmitErrorAction = 'reauthenticate' | 'setup' | null

export interface SubmitErrorDetails {
  message: string
  guidance: string
  action: SubmitErrorAction
}

export function splitDraftForIssue(description: string): { title: string; body: string } {
  const trimmed = description.trim()
  if (!trimmed) return { title: '', body: '' }

  const lines = trimmed.split('\n')
  const title = lines[0].trim().substring(0, MAX_TITLE_LENGTH)
  const body = lines.length > 1 ? lines.slice(1).join('\n').trim() : ''
  return { title, body }
}

export function buildDirectIssueUrl(targetRepo: TargetRepo, description: string): string {
  const repoName = targetRepo === 'docs' ? 'docs' : 'console'
  const { title, body } = splitDraftForIssue(description)

  return buildGitHubIssueUrl({
    owner: 'kubestellar',
    repo: repoName,
    title,
    body,
  })
}

export function getSubmitErrorDetails(
  error: string,
  canPerformActions: boolean,
  t: (key: string, defaultValue?: string) => string,
): SubmitErrorDetails {
  const normalized = error.toLowerCase()
  const needsGitHubReauth =
    normalized.includes('resource not accessible by personal access token') ||
    normalized.includes('current token does not have permission to open issues in this repository') ||
    (normalized.includes('github api returned 403') && normalized.includes('create github issue'))

  if (needsGitHubReauth) {
    return {
      message: t(
        'feedback.submitPermissionDenied',
        'GitHub could not create the issue because the current token does not have permission to open issues in this repository. Re-authenticate with GitHub OAuth and try again.',
      ),
      guidance: canPerformActions
        ? t(
          'feedback.submitPermissionDeniedGuidance',
          'Reconnect your GitHub account to refresh the OAuth session, or open the issue directly on GitHub if you need to file it right now.',
        )
        : t('feedback.submitFailedGuidance'),
      action: canPerformActions ? 'reauthenticate' : 'setup',
    }
  }

  return {
    message: error,
    guidance: t('feedback.submitFailedGuidance'),
    action: !canPerformActions ? 'setup' : null,
  }
}

export function preventModalScrollChaining(event: WheelEvent<HTMLElement>) {
  const element = event.currentTarget
  const { scrollTop, scrollHeight, clientHeight } = element

  if (scrollHeight <= clientHeight) {
    return
  }

  const isScrollingDown = event.deltaY > 0
  const isAtTop = scrollTop <= SCROLL_EDGE_TOLERANCE_PX
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_EDGE_TOLERANCE_PX
  const canScrollWithinElement = isScrollingDown ? !isAtBottom : !isAtTop

  if (canScrollWithinElement) {
    event.stopPropagation()
  }
}
