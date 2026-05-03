import { useState, useCallback } from 'react'
import { GitPullRequestArrow, ExternalLink, Loader2 } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { Button } from '../ui/Button'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import type { MissionControlState } from './types'
import { buildApprovalIssueBody } from './buildApprovalIssueBody'
import { encodePlan } from './missionPlanCodec'

const GITHUB_API = 'https://api.github.com'
const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/
const CONSOLE_BASE_URL = 'https://console.kubestellar.io'

interface RequestApprovalModalProps {
  isOpen: boolean
  onClose: () => void
  state: MissionControlState
  installedProjects: Set<string>
}

export function RequestApprovalModal({
  isOpen,
  onClose,
  state,
  installedProjects,
}: RequestApprovalModalProps) {
  const { token } = useAuth()
  const { showToast } = useToast()
  const [repo, setRepo] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [issueUrl, setIssueUrl] = useState<string | null>(null)

  const isValidRepo = REPO_PATTERN.test(repo.trim())

  const handleSubmit = useCallback(async () => {
    const trimmedRepo = repo.trim()
    if (!isValidRepo || !token) return

    setSubmitting(true)
    try {
      const title = `[Mission Control] Deployment Approval: ${state.title || 'Untitled Mission'}`
      const encoded = encodePlan(state, notes.trim() || undefined)
      const reviewUrl = `${CONSOLE_BASE_URL}?mission-control=review&plan=${encoded}`
      const body = buildApprovalIssueBody(state, installedProjects, notes.trim() || undefined, reviewUrl)

      const res = await fetch(`${GITHUB_API}/repos/${trimmedRepo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          labels: ['mission-control-approval'],
        }),
        signal: AbortSignal.timeout(30_000),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { message?: string }).message || `HTTP ${res.status}`
        if (res.status === 404) {
          showToast(`Repository "${trimmedRepo}" not found or you don't have write access`, 'error')
        } else if (res.status === 422 && msg.includes('label')) {
          const retryRes = await fetch(`${GITHUB_API}/repos/${trimmedRepo}/issues`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, body }),
            signal: AbortSignal.timeout(30_000),
          })
          if (!retryRes.ok) {
            showToast(`Failed to create issue: ${msg}`, 'error')
            return
          }
          const retryData = await retryRes.json() as { html_url: string }
          setIssueUrl(retryData.html_url)
          showToast('Approval request created (label skipped)', 'success')
          return
        } else {
          showToast(`Failed to create issue: ${msg}`, 'error')
        }
        return
      }

      const data = await res.json() as { html_url: string }
      setIssueUrl(data.html_url)
      showToast('Approval request created on GitHub', 'success')
    } catch (err: unknown) {
      showToast(`Network error: ${err instanceof Error ? err.message : 'unknown'}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }, [repo, isValidRepo, token, state, installedProjects, showToast])

  const handleClose = useCallback(() => {
    setRepo('')
    setNotes('')
    setIssueUrl(null)
    setSubmitting(false)
    onClose()
  }, [onClose])

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      closeOnBackdrop
      closeOnEscape
    >
      <BaseModal.Header
        title="Request Deployment Approval"
        description="Create a GitHub issue with the full deployment plan for team review"
        icon={GitPullRequestArrow}
        onClose={handleClose}
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {!issueUrl ? (
            <>
              <div>
                <label htmlFor="approval-repo" className="block text-sm font-medium text-foreground mb-1.5">
                  Target Repository
                </label>
                <input
                  id="approval-repo"
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="org/repo"
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isValidRepo && !submitting) handleSubmit()
                  }}
                />
                {repo && !isValidRepo && (
                  <p className="text-xs text-destructive mt-1">Enter a valid repository in owner/repo format</p>
                )}
              </div>

              <div>
                <label htmlFor="approval-notes" className="block text-sm font-medium text-foreground mb-1.5">
                  Notes for Reviewers <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  id="approval-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Skip Phase 2 if cert-manager is already running. Need SRE sign-off before Phase 3."
                  rows={3}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Issue will include
                </h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>Mission description and {state.projects.length} project{state.projects.length !== 1 ? 's' : ''}</li>
                  <li>Cluster assignments ({state.assignments.filter(a => (a.projectNames ?? []).length > 0).length} clusters)</li>
                  <li>Phased rollout plan with estimates</li>
                  <li>Approval checklist for reviewers</li>
                  <li>"View in Console" deep link for interactive review</li>
                </ul>
              </div>

              {!token && (
                <p className="text-xs text-amber-400">
                  You must be logged in with GitHub to create issues.
                </p>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <GitPullRequestArrow className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-sm text-foreground font-medium mb-2">Approval request created</p>
              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm"
              >
                View on GitHub <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex items-center justify-end gap-2 w-full">
          {!issueUrl ? (
            <>
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={!isValidRepo || submitting || !token}
                icon={submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequestArrow className="w-3.5 h-3.5" />}
              >
                {submitting ? 'Creating…' : 'Create Issue'}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={handleClose}>
              Done
            </Button>
          )}
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
