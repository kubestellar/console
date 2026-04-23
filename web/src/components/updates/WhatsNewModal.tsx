import { useState, useMemo, useCallback, useEffect } from 'react'
import { Download, Clock, SkipForward, ChevronDown, Copy, Check, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { BaseModal } from '../../lib/modals'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useSelfUpgrade } from '../../hooks/useSelfUpgrade'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { buildReleaseNotesComponents } from '../../lib/markdown/releaseNotesComponents'
import { cn } from '../../lib/cn'
import { copyToClipboard } from '../../lib/clipboard'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { emitWhatsNewUpdateClicked, emitWhatsNewRemindLater } from '../../lib/analytics'

const SNOOZE_STORAGE_KEY = 'kc-update-snoozed'

// Clean up the removed kill-switch key so users who had it set during
// development don't get a dead button. Runs once on module load.
try { localStorage.removeItem('kc-whats-new-modal-disabled') } catch { /* ignore */ }

const SNOOZE_DURATION_1H_MS = 60 * 60 * 1000
const SNOOZE_DURATION_1D_MS = 24 * 60 * 60 * 1000
const SNOOZE_DURATION_1W_MS = 7 * 24 * 60 * 60 * 1000

export function isUpdateSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY)
    if (!raw) return false
    const snoozedUntil = Number(raw)
    return Date.now() < snoozedUntil
  } catch {
    return false
  }
}


function snoozeUpdate(durationMs: number) {
  try {
    localStorage.setItem(SNOOZE_STORAGE_KEY, String(Date.now() + durationMs))
  } catch {
    // localStorage unavailable — silently ignore
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'yesterday'
  if (diffD < 30) return `${diffD}d ago`
  return date.toLocaleDateString()
}

interface WhatsNewModalProps {
  isOpen: boolean
  onClose: () => void
}

export function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const {
    latestRelease,
    releases,
    currentVersion,
    commitHash,
    installMethod,
    skipVersion,
    triggerUpdate,
  } = useVersionCheck()
  const { triggerUpgrade } = useSelfUpgrade()

  const [updating, setUpdating] = useState(false)
  const [showPreviousReleases, setShowPreviousReleases] = useState(false)
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null)
  const [showManualUpdate, setShowManualUpdate] = useState(false)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [recentPRs, setRecentPRs] = useState<Array<{ number: number; title: string; merged_at: string }>>([])
  // Auto-QA #9036 — surface loading/error state for the PR fallback fetch
  // so users see either a spinner while the list is being fetched or a
  // short error message if GitHub is unreachable, instead of an empty modal.
  const [prsLoading, setPrsLoading] = useState(false)
  const [prsError, setPrsError] = useState<string | null>(null)

  const markdownComponents = useMemo(() => buildReleaseNotesComponents('sm'), [])

  // When release notes are empty, fetch merged PRs since the running commit.
  // First get the commit date for the running hash, then filter PRs merged after.
  const MAX_RECENT_PRS = 50
  const hasReleaseNotes = !!latestRelease?.releaseNotes?.trim()
  useEffect(() => {
    if (hasReleaseNotes || !isOpen) return
    let cancelled = false
    const fetchPRs = async () => {
      setPrsLoading(true)
      setPrsError(null)
      try {
        // Step 1: Get the date of the currently running commit
        let sinceDate: string | null = null
        if (commitHash && commitHash !== 'unknown') {
          const commitResp = await fetch(
            `/api/github/repos/kubestellar/console/commits/${commitHash}`,
            { credentials: 'include', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) },
          )
          if (commitResp.ok) {
            const commitData = await commitResp.json()
            sinceDate = commitData?.commit?.committer?.date ?? null
          }
        }

        // Step 2: Fetch recent merged PRs
        const resp = await fetch(
          `/api/github/repos/kubestellar/console/pulls?state=closed&sort=updated&direction=desc&per_page=${MAX_RECENT_PRS}`,
          { credentials: 'include', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) },
        )
        if (cancelled) return
        if (!resp.ok) {
          setPrsError(`GitHub responded ${resp.status}`)
          return
        }
        const data = await resp.json()
        if (cancelled) return
        const merged = (data || [])
          .filter((pr: { merged_at: string | null }) => pr.merged_at)
          // Only show PRs merged AFTER the running commit
          .filter((pr: { merged_at: string }) => {
            if (!sinceDate) return true // no commit date = show all
            return new Date(pr.merged_at) > new Date(sinceDate)
          })
          .map((pr: { number: number; title: string; merged_at: string }) => ({
            number: pr.number,
            title: pr.title,
            merged_at: pr.merged_at,
          }))
        setRecentPRs(merged)
      } catch (err) {
        if (cancelled) return
        // Don't surface AbortError (user closed modal) as an error
        const message = err instanceof Error ? err.message : 'Network error'
        setPrsError(message)
      } finally {
        if (!cancelled) setPrsLoading(false)
      }
    }
    fetchPRs()
    return () => { cancelled = true }
  }, [hasReleaseNotes, isOpen, commitHash])

  const previousReleases = useMemo(() => {
    if (!releases || !currentVersion || !latestRelease) return []
    return (releases || [])
      .filter(r => r.tag !== latestRelease.tag && r.publishedAt > new Date(0))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 10)
  }, [releases, currentVersion, latestRelease])

  const handleUpdate = useCallback(async () => {
    setUpdating(true)
    try {
      if (installMethod === 'helm') {
        const tag = latestRelease?.tag ?? ''
        const result = await triggerUpgrade(tag)
        if (!result.success) {
          showToast(result.error ?? 'Update failed', 'error')
          return
        }
      } else {
        const result = await triggerUpdate()
        if (!result.success) {
          showToast(result.error ?? 'Update failed', 'error')
          return
        }
      }
      emitWhatsNewUpdateClicked(latestRelease?.tag ?? '', installMethod ?? 'unknown')
      showToast('Update running in background', 'info')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setUpdating(false)
    }
  }, [installMethod, triggerUpdate, triggerUpgrade, latestRelease?.tag, showToast, onClose])

  const handleSkip = useCallback(() => {
    if (latestRelease) {
      skipVersion(latestRelease.tag)
    }
    onClose()
  }, [latestRelease, skipVersion, onClose])

  const handleSnooze = useCallback((durationMs: number, label: string) => {
    snoozeUpdate(durationMs)
    setShowSnoozeMenu(false)
    emitWhatsNewRemindLater(latestRelease?.tag ?? '', label)
    showToast('Update reminder snoozed', 'info')
    onClose()
  }, [showToast, onClose, latestRelease?.tag])

  const handleCopyCommand = useCallback(async (cmd: string) => {
    await copyToClipboard(cmd)
    setCopiedCommand(cmd)
    /** Delay before clearing the "copied" indicator so user sees feedback (ms) */
    const COPY_FEEDBACK_CLEAR_MS = 2000
    setTimeout(() => setCopiedCommand(null), COPY_FEEDBACK_CLEAR_MS)
  }, [])

  const manualCommands: { label: string; command: string }[] = useMemo(() => {
    switch (installMethod) {
      case 'dev':
        return [{ label: 'From source', command: 'cd /tmp/kubestellar-console && git pull && bash startup-oauth.sh' }]
      case 'helm':
        return [{ label: 'Helm', command: 'helm upgrade kubestellar-console kubestellar/console -n kubestellar-console' }]
      case 'binary':
        return [
          { label: 'Homebrew', command: 'brew upgrade kc-agent' },
          { label: 'Quick install', command: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash' },
        ]
      default:
        return [{ label: 'Quick install', command: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash' }]
    }
  }, [installMethod])

  // Developer channel: no release object, just a SHA diff. Show a
  // minimal modal with the commit SHA instead of full release notes.
  if (!latestRelease && !isOpen) return null

  const relativeTime = latestRelease ? formatRelativeTime(latestRelease.publishedAt) : 'just now'

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title={t('update.whatsNew', "What's new in KubeStellar Console")}
        description={latestRelease ? `${latestRelease.tag} — released ${relativeTime}` : `New commits available`}
        icon={Download}
        onClose={onClose}
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Primary release notes — or recent merged PRs as fallback */}
          {hasReleaseNotes ? (
            <div className="prose dark:prose-invert max-w-none text-sm overflow-x-auto wrap-break-word [word-break:break-word] prose-pre:my-5 prose-pre:bg-transparent prose-pre:p-0 prose-code:text-purple-700 dark:prose-code:text-purple-300 prose-code:bg-black/5 dark:prose-code:bg-black/20 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={markdownComponents}
              >
                {latestRelease?.releaseNotes ?? ''}
              </ReactMarkdown>
            </div>
          ) : prsLoading ? (
            // Auto-QA #9036 — loading state for the PR fallback fetch
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading recent pull requests…</span>
            </div>
          ) : prsError ? (
            // Auto-QA #9036 — error state replaces the old silent failure
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              Couldn&apos;t load recent pull requests: {prsError}
            </div>
          ) : recentPRs.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">
                Recently merged pull requests:
              </p>
              {recentPRs.map((pr) => (
                <a
                  key={pr.number}
                  href={`https://github.com/kubestellar/console/pull/${pr.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 transition-colors group"
                >
                  <span className="text-xs text-muted-foreground font-mono shrink-0">#{pr.number}</span>
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">{pr.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {formatRelativeTime(new Date(pr.merged_at))}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="prose dark:prose-invert max-w-none text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                {'*No release notes available. Pull the latest commits to update.*'}
              </ReactMarkdown>
            </div>
          )}

          {/* Previous releases (collapsible) */}
          {previousReleases.length > 0 && (
            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowPreviousReleases(!showPreviousReleases)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              >
                <ChevronDown className={cn('w-4 h-4 transition-transform', showPreviousReleases && 'rotate-180')} />
                Previous releases ({previousReleases.length} versions)
              </button>
              {showPreviousReleases && (
                <div className="mt-3 space-y-2">
                  {previousReleases.map(release => (
                    <div key={release.tag} className="border border-border rounded-lg">
                      <button
                        type="button"
                        onClick={() => setExpandedRelease(expandedRelease === release.tag ? null : release.tag)}
                        className="flex items-center justify-between w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors rounded-lg"
                      >
                        <span className="font-medium text-foreground">{release.tag}</span>
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(release.publishedAt)}</span>
                      </button>
                      {expandedRelease === release.tag && release.releaseNotes && (
                        <div className="px-3 pb-3 prose dark:prose-invert max-w-none text-xs overflow-x-auto wrap-break-word [word-break:break-word]">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                            {release.releaseNotes}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual update commands (collapsible) */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowManualUpdate(!showManualUpdate)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            >
              <ChevronDown className={cn('w-4 h-4 transition-transform', showManualUpdate && 'rotate-180')} />
              How to update manually
            </button>
            {showManualUpdate && (
              <div className="mt-3 space-y-2">
                {manualCommands.map(({ label, command }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{label}:</span>
                    <code className="flex-1 text-xs bg-secondary px-2 py-1 rounded font-mono truncate">{command}</code>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand(command)}
                      className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground shrink-0"
                      title="Copy command"
                    >
                      {copiedCommand === command ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip this version
            </button>

            {/* Remind me later dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5" />
                Remind me later
                <ChevronDown className="w-3 h-3" />
              </button>
              {showSnoozeMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-lg shadow-xl z-50 py-1 min-w-[160px]">
                  <button
                    type="button"
                    onClick={() => handleSnooze(SNOOZE_DURATION_1H_MS, '1h')}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary transition-colors"
                  >
                    In 1 hour
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSnooze(SNOOZE_DURATION_1D_MS, '1d')}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary transition-colors"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSnooze(SNOOZE_DURATION_1W_MS, '1w')}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary transition-colors"
                  >
                    Next week
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Later
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              disabled={updating}
              className="px-4 py-1.5 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {updating ? (
                <>Updating...</>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Update now
                </>
              )}
            </button>
          </div>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
