import { COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants'
import { formatTimeAgo } from '../../lib/formatters'
import { useState, useMemo, useCallback } from 'react'
import { Download, ChevronDown, Copy, Check } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useSelfUpgrade } from '../../hooks/useSelfUpgrade'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { buildReleaseNotesComponents } from '../../lib/markdown/releaseNotesComponents'
import { cn } from '../../lib/cn'
import { copyToClipboard } from '../../lib/clipboard'
import { emitWhatsNewUpdateClicked, emitWhatsNewRemindLater } from '../../lib/analytics'
import { useRecentPRs } from './whatsNew/useRecentPRs'
import { ReleaseNotesContent } from './whatsNew/ReleaseNotesContent'
import { PreviousReleases } from './whatsNew/PreviousReleases'
import { WhatsNewFooter } from './whatsNew/WhatsNewFooter'
import { snoozeUpdate } from './whatsNew/snooze'

// Clean up the removed kill-switch key so users who had it set during
// development don't get a dead button. Runs once on module load.
try { localStorage.removeItem('kc-whats-new-modal-disabled') } catch { /* ignore */ }

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
  const [showManualUpdate, setShowManualUpdate] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  const markdownComponents = useMemo(() => buildReleaseNotesComponents('sm'), [])
  const hasReleaseNotes = !!latestRelease?.releaseNotes?.trim()

  const { recentPRs, prsLoading, prsError } = useRecentPRs({ hasReleaseNotes, isOpen, commitHash })

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
    } catch (err: unknown) {
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
    emitWhatsNewRemindLater(latestRelease?.tag ?? '', label)
    showToast('Update reminder snoozed', 'info')
    onClose()
  }, [showToast, onClose, latestRelease?.tag])

  const handleCopyCommand = useCallback(async (cmd: string) => {
    await copyToClipboard(cmd)
    setCopiedCommand(cmd)
    setTimeout(() => setCopiedCommand(null), COPY_FEEDBACK_TIMEOUT_MS)
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

  const relativeTime = latestRelease ? formatTimeAgo(latestRelease.publishedAt) : 'just now'

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
          <ReleaseNotesContent
            hasReleaseNotes={hasReleaseNotes}
            releaseNotes={latestRelease?.releaseNotes}
            recentPRs={recentPRs}
            prsLoading={prsLoading}
            prsError={prsError}
            markdownComponents={markdownComponents}
          />

          {/* Previous releases (collapsible) */}
          <PreviousReleases releases={previousReleases} markdownComponents={markdownComponents} />

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
        <WhatsNewFooter
          updating={updating}
          onSnooze={handleSnooze}
          onSkip={handleSkip}
          onUpdate={handleUpdate}
          onClose={onClose}
        />
      </BaseModal.Footer>
    </BaseModal>
  )
}
