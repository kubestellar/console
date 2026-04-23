import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  RefreshCw,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Terminal,
  Ship,
  AlertTriangle,
  Zap,
  GitBranch,
  Loader2,
  GitPullRequestArrow,
  Bot,
  X,
  Shield,
  HardDrive,
  GitCommitHorizontal,
  Info,
} from 'lucide-react'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpdateProgress } from '../../hooks/useUpdateProgress'
import { useSelfUpgrade } from '../../hooks/useSelfUpgrade'
import { Button } from '../ui/Button'
import { useAuth } from '../../lib/auth'
import type { UpdateChannel } from '../../types/updates'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'
import {
  emitUpdateChecked,
  emitUpdateTriggered,
  emitUpdateCompleted,
  emitUpdateFailed,
  emitUpdateStalled,
  emitUpdateRefreshed,
} from '../../lib/analytics'

/** Minimum spin duration to guarantee one full rotation (matches cards) */
const MIN_SPIN_DURATION = 1000

/** Initial progress bar percentage shown before WebSocket messages arrive */
const INITIAL_PROGRESS_PCT = 5

/** Estimated total update duration in seconds (pull + install + build + restart) */
const ESTIMATED_UPDATE_SECS = 180

/** Timeout (ms) for the trigger to receive a WebSocket progress message before auto-failing */
const TRIGGER_STALL_TIMEOUT_MS = 30_000

/** Countdown tick interval in milliseconds */
const COUNTDOWN_TICK_MS = 1000

/** Duration (ms) to show the transient "check complete" banner before auto-dismiss */
const CHECK_RESULT_DISPLAY_MS = 4000

/** Scroll to a settings section by ID (mirrors Settings.tsx logic) */
function scrollToSettingsSection(sectionId: string) {
  const element = document.getElementById(sectionId)
  const container = document.getElementById('main-content')
  if (!element || !container) return
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const y = elementRect.top - containerRect.top + container.scrollTop - 80
  container.scrollTo({ top: y, behavior: 'smooth' })
  element.classList.add('ring-2', 'ring-purple-500/50')
  setTimeout(() => element.classList.remove('ring-2', 'ring-purple-500/50'), UI_FEEDBACK_TIMEOUT_MS)
}

export function UpdateSettings() {
  const { t } = useTranslation()
  const {
    currentVersion,
    commitHash,
    channel,
    setChannel,
    latestRelease,
    hasUpdate,
    isChecking,
    error,
    lastChecked,
    forceCheck,
    autoUpdateEnabled,
    installMethod,
    autoUpdateStatus,
    agentConnected,
    hasCodingAgent,
    latestMainSHA,
    recentCommits,
    setAutoUpdateEnabled,
    triggerUpdate,
    cancelUpdate,
    lastCheckResult,
    clearLastCheckResult,
  } = useVersionCheck()

  // WebSocket-driven update progress from kc-agent
  const { progress: updateProgress, stepHistory, dismiss: dismissProgress } = useUpdateProgress()

  // OAuth is configured if the user is authenticated (no backend call needed)
  const { isAuthenticated } = useAuth()
  const oauthConfigured = isAuthenticated

  // Helm self-upgrade via Deployment image patch
  const {
    isAvailable: selfUpgradeAvailable,
    triggerUpgrade: triggerSelfUpgrade,
    isTriggering: isSelfUpgrading,
    triggerError: selfUpgradeError,
    isRestarting: isSelfUpgradeRestarting,
    restartComplete: selfUpgradeRestartComplete,
    restartError: selfUpgradeRestartError,
    restartElapsed: selfUpgradeRestartElapsed,
  } = useSelfUpgrade()

  const CHANNEL_OPTIONS: { value: UpdateChannel; label: string; description: string; devOnly?: boolean }[] = [
    {
      value: 'stable',
      label: t('settings.updates.stable'),
      description: t('settings.updates.stableDesc'),
    },
    {
      value: 'unstable',
      label: t('settings.updates.unstable'),
      description: t('settings.updates.unstableDesc'),
    },
    {
      value: 'developer',
      label: t('settings.updates.developer'),
      description: t('settings.updates.developerDesc'),
      devOnly: true,
    },
  ]

  // Only show developer channel for dev installs
  const visibleChannels = CHANNEL_OPTIONS.filter(
    (o) => !o.devOnly || installMethod === 'dev'
  )

  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [showPrereqs, setShowPrereqs] = useState(false)
  const [showScopeInfo, setShowScopeInfo] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false)
  const [triggerState, setTriggerState] = useState<'idle' | 'triggered' | 'error'>('idle')
  const [triggerError, setTriggerError] = useState<string | null>(null)
  // Tracks a user-requested cancellation so we can show a pending state on the
  // Cancel button while kc-agent finishes the in-flight step. Cleared when
  // updateProgress transitions to "cancelled", "done", or "failed".
  const [cancelState, setCancelState] = useState<'idle' | 'pending' | 'error'>('idle')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(ESTIMATED_UPDATE_SECS)
  const triggerGuardRef = useRef(false) // prevents rapid double-clicks from firing multiple triggers
  const triggerTimestampRef = useRef(0) // when "Update Now" was clicked (for duration tracking)

  // Track visual spinning for Check Now button (ensures 1 full rotation like cards)
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isChecking) {
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)
      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isChecking])

  // Check for updates once on mount — use a ref to avoid re-firing when
  // forceCheck's identity changes (its useCallback deps include state that
  // changes after each check, which would cause a rapid-fire loop).
  const mountCheckDoneRef = useRef(false)
  useEffect(() => {
    if (mountCheckDoneRef.current) return
    mountCheckDoneRef.current = true
    forceCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-dismiss the transient check result banner after a short delay
  useEffect(() => {
    if (!lastCheckResult) return
    const timer = setTimeout(() => clearLastCheckResult(), CHECK_RESULT_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [lastCheckResult, clearLastCheckResult])

  // Clear triggered state once WebSocket progress starts or update fails.
  // Emit GA4 lifecycle events for update completion/failure.
  useEffect(() => {
    if (updateProgress && triggerState === 'triggered') {
      setTriggerState('idle')
    }
    // Reset the double-click guard when the update finishes (success or failure)
    // so the user can retry without refreshing
    if (updateProgress && updateProgress.status === 'done') {
      triggerGuardRef.current = false
      setCancelState('idle')
      setCancelError(null)
      const durationMs = triggerTimestampRef.current
        ? Date.now() - triggerTimestampRef.current
        : 0
      emitUpdateCompleted(durationMs)
    } else if (updateProgress && updateProgress.status === 'failed') {
      triggerGuardRef.current = false
      setCancelState('idle')
      setCancelError(null)
      emitUpdateFailed(updateProgress.error ?? updateProgress.message ?? 'unknown')
    } else if (updateProgress && updateProgress.status === 'cancelled') {
      // User-initiated cancel completed — reset all trigger state so the
      // "Update Now" button reappears and the user can retry if they want.
      triggerGuardRef.current = false
      setCancelState('idle')
      setCancelError(null)
    }
  }, [updateProgress, triggerState])

  // Auto-fail the triggered state if no WebSocket progress arrives within timeout.
  // This prevents the UI from being stuck forever on "Starting update — please wait..."
  // when kc-agent accepts the trigger but never sends progress messages (e.g. no update needed).
  useEffect(() => {
    if (triggerState !== 'triggered') return
    const timer = setTimeout(() => {
      setTriggerState('error')
      setTriggerError('No response from kc-agent — the update may not have started. Check if an update is actually available.')
      triggerGuardRef.current = false
      emitUpdateStalled()
    }, TRIGGER_STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [triggerState])


  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const copyCommand = async (command: string, id: string) => {
    await copyToClipboard(command)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    setCopiedCommand(id)
    copyTimeoutRef.current = setTimeout(() => setCopiedCommand(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const formatLastChecked = () => {
    if (!lastChecked) return t('settings.updates.never')
    const now = Date.now()
    const diff = now - lastChecked
    if (diff < 60000) return t('settings.updates.justNow')
    if (diff < 3600000) return t('settings.updates.minutesAgo', { count: Math.floor(diff / 60000) })
    if (diff < 86400000) return t('settings.updates.hoursAgo', { count: Math.floor(diff / 3600000) })
    return new Date(lastChecked).toLocaleDateString()
  }

  const shortSHA = (sha: string) => sha ? sha.slice(0, 7) : '—'

  const helmCommand = latestRelease
    ? `helm upgrade kc kubestellar-console/kubestellar-console --version ${latestRelease.tag.replace(/^v/, '')} -n kc`
    : 'helm upgrade kc kubestellar-console/kubestellar-console -n kc'

  const brewCommand = 'brew upgrade kubestellar/tap/kc-agent'

  const isDeveloperChannel = channel === 'developer'
  const isHelmInstall = installMethod === 'helm'
  const isWsUpdating = updateProgress && !['idle', 'done', 'failed', 'cancelled'].includes(updateProgress.status)
  const isUpdating = isWsUpdating || triggerState === 'triggered'

  // Cancellation is only allowed for steps that run before the restart step.
  // Once kc-agent has reached "restarting", startup-oauth.sh is already spawned
  // and cannot be cancelled. Disable the Cancel button in that case.
  const RESTART_STEP_NUMBER = 6
  const canCancel = isUpdating
    && updateProgress
    && updateProgress.status !== 'restarting'
    && (updateProgress.step === undefined || updateProgress.step < RESTART_STEP_NUMBER)

  // Countdown timer during updates — reset on start, tick every second
  useEffect(() => {
    if (isUpdating) {
      setCountdown(ESTIMATED_UPDATE_SECS)
      const id = setInterval(() => {
        setCountdown(prev => Math.max(0, prev - 1))
      }, COUNTDOWN_TICK_MS)
      return () => clearInterval(id)
    }
  }, [isUpdating])

  // SHAs match = up to date on developer channel
  const currentSHA = autoUpdateStatus?.currentSHA ?? commitHash
  const latestSHA = autoUpdateStatus?.latestSHA ?? latestMainSHA ?? ''
  const shasMatch = isDeveloperChannel && currentSHA && latestSHA && currentSHA.startsWith(latestSHA.slice(0, 7))

  return (
    <div id="system-updates-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${hasUpdate ? 'bg-green-500/20' : 'bg-secondary'}`}
          >
            <Download
              className={`w-5 h-5 ${hasUpdate ? 'text-green-400' : 'text-muted-foreground'}`}
            />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">{t('settings.updates.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.updates.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Install method badge */}
          {installMethod !== 'unknown' && (
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-secondary text-muted-foreground">
              {installMethod === 'dev' ? t('settings.updates.devMode') :
               installMethod === 'binary' ? t('settings.updates.binaryMode') :
               t('settings.updates.helmMode')}
            </span>
          )}
          <Button
            variant="ghost"
            size="md"
            icon={<RefreshCw className={`w-4 h-4 ${isVisuallySpinning ? 'animate-spin-min text-blue-400' : ''}`} />}
            onClick={() => { emitUpdateChecked(); forceCheck() }}
            disabled={isChecking || isVisuallySpinning}
          >
            {t('settings.updates.checkNow')}
          </Button>
        </div>
      </div>

      {/* Scope info — explains what System Updates controls vs. other update types */}
      <div className="mb-4">
        <button
          onClick={() => setShowScopeInfo(!showScopeInfo)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="w-4 h-4" />
          <span>{t('settings.updates.scopeInfoToggle')}</span>
          {showScopeInfo ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showScopeInfo && (
          <div className="mt-3 rounded-lg bg-secondary/50 border border-border p-4 space-y-3 text-sm">
            <div>
              <span className="font-medium text-foreground">{t('settings.updates.scopeSystemTitle')}</span>
              <span className="text-muted-foreground"> — {t('settings.updates.scopeSystemDesc')}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t('settings.updates.scopeReloadTitle')}</span>
              <span className="text-muted-foreground"> — {t('settings.updates.scopeReloadDesc')}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t('settings.updates.scopeCardDataTitle')}</span>
              <span className="text-muted-foreground"> — {t('settings.updates.scopeCardDataDesc')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Channel Selector */}
      <div className="mb-4">
        <label className="block text-sm text-muted-foreground mb-2">
          {t('settings.updates.updateChannel')}
        </label>
        <div className="relative">
          <button
            onClick={() => setChannelDropdownOpen(!channelDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border text-foreground hover:bg-secondary/80 transition-colors"
          >
            <span className="flex items-center gap-2">
              {isDeveloperChannel && <GitBranch className="w-4 h-4 text-orange-400" />}
              {visibleChannels.find((o) => o.value === channel)?.label}
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${channelDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {channelDropdownOpen && (
            <div className="absolute z-dropdown mt-2 w-full rounded-lg bg-card border border-border shadow-xl">
              {visibleChannels.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setChannel(option.value)
                    setChannelDropdownOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    channel === option.value ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="text-left">
                    <p
                      className={`text-sm flex items-center gap-2 ${channel === option.value ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      {option.value === 'developer' && <GitBranch className="w-3.5 h-3.5 text-orange-400" />}
                      {option.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                  {channel === option.value && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Environment Prerequisites — collapsible, developer channel only */}
      {isDeveloperChannel && (() => {
        const prereqChecks = [
          agentConnected,
          hasCodingAgent,
          oauthConfigured,
          installMethod === 'dev',
        ]
        const failCount = prereqChecks.filter((c) => !c).length
        return (
          <div className="mb-4 rounded-lg bg-secondary/30 border border-border overflow-hidden">
            <button
              onClick={() => setShowPrereqs(!showPrereqs)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {t('settings.updates.environment')}
                </span>
                <span className={`text-xs ${failCount === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {failCount === 0
                    ? t('settings.updates.allPrereqsMet')
                    : t('settings.updates.prereqsMissing', { count: failCount })}
                </span>
              </div>
              {showPrereqs ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showPrereqs && (
              <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                <PrereqRow
                  ok={agentConnected}
                  label={t('settings.updates.prereqKCAgent')}
                  okText={t('settings.updates.prereqKCAgentOk')}
                  failText={t('settings.updates.prereqKCAgentFail')}
                  fixText={t('settings.updates.prereqKCAgentFix')}
                  onFix={() => scrollToSettingsSection('agent-settings')}
                  icon={<Terminal className="w-3.5 h-3.5" />}
                />
                <PrereqRow
                  ok={hasCodingAgent}
                  label={t('settings.updates.prereqCodingAgent')}
                  okText={t('settings.updates.prereqCodingAgentOk')}
                  failText={t('settings.updates.prereqCodingAgentFail')}
                  fixText={t('settings.updates.prereqCodingAgentFix')}
                  onFix={() => scrollToSettingsSection('agent-settings')}
                  icon={<Bot className="w-3.5 h-3.5" />}
                />
                <PrereqRow
                  ok={oauthConfigured}
                  label={t('settings.updates.prereqOAuth')}
                  okText={t('settings.updates.prereqOAuthOk')}
                  failText={t('settings.updates.prereqOAuthFail')}
                  icon={<Shield className="w-3.5 h-3.5" />}
                />
                <PrereqRow
                  ok={installMethod === 'dev'}
                  label={t('settings.updates.prereqInstall')}
                  okText={t('settings.updates.prereqInstallOk')}
                  failText={t('settings.updates.prereqInstallFail')}
                  icon={<HardDrive className="w-3.5 h-3.5" />}
                />
              </div>
            )}
          </div>
        )
      })()}

      {/* Auto-Update Toggle — requires kc-agent + coding agent (Claude Code, etc.) */}
      {!isHelmInstall && agentConnected && hasCodingAgent && (
        <div className="mb-4 p-4 rounded-lg bg-secondary/30 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className={`w-4 h-4 ${autoUpdateEnabled ? 'text-yellow-400' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm font-medium text-foreground">{t('settings.updates.autoUpdate')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.updates.autoUpdateDesc')}</p>
              </div>
            </div>
            <button
              onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                autoUpdateEnabled
                  ? 'bg-green-500 border-green-500'
                  : 'bg-transparent border-muted-foreground/40 hover:border-muted-foreground'
              }`}
            >
              {autoUpdateEnabled && <Check className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
          {autoUpdateEnabled && isDeveloperChannel && autoUpdateStatus?.hasUncommittedChanges && (
            <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <GitCommitHorizontal className="w-4 h-4 text-blue-400 shrink-0" />
              <p className="text-xs text-blue-400">{t('settings.updates.uncommittedAutoStash')}</p>
            </div>
          )}
        </div>
      )}

      {/* Agent Required Notice */}
      {!agentConnected && !isHelmInstall && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-400">{t('settings.updates.agentRequired')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.agentRequiredDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Helm Install Notice — self-upgrade available or manual instructions */}
      {isHelmInstall && !selfUpgradeAvailable && (
        <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-purple-400">{t('settings.updates.helmDisabled')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.helmDisabledDesc')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.updates.helmSelfUpgradeHint')}
              </p>
            </div>
          </div>
        </div>
      )}
      {isHelmInstall && selfUpgradeAvailable && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-400">{t('settings.updates.helmSelfUpgradeReady')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.helmSelfUpgradeDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Dev Mode Warning — only shown for actual dev installs (running from source)
           where the version doesn't match a release tag pattern. Helm/binary installs
           often report versions without the 'v' prefix (e.g., "0.3.21") which is normal. */}
      {installMethod === 'dev' && !isDeveloperChannel && !currentVersion.includes('nightly') && !currentVersion.includes('weekly') && currentVersion !== 'unknown' && (
        <div className="p-3 rounded-lg mb-4 bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400">
            {t('settings.updates.devVersion', { envVar: 'VITE_APP_VERSION' })}
          </p>
        </div>
      )}

      {/* Transient check-complete feedback — auto-dismissed after CHECK_RESULT_DISPLAY_MS */}
      {lastCheckResult === 'success' && !isChecking && !isVisuallySpinning && !hasUpdate && !error && (
        <div data-testid="check-complete-banner" className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-sm text-green-400">{t('settings.updates.upToDate')}</p>
        </div>
      )}

      {/* Update Progress Banner */}
      {isUpdating && (
        <div data-testid="update-progress-banner" className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          {/* Header with current status */}
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <p data-testid="update-progress-message" className="text-sm font-medium text-blue-400 flex-1 min-w-0">
              {updateProgress?.message ?? t('settings.updates.startingUpdate')}
            </p>
          </div>

          {/* Step detail entries */}
          {stepHistory.length > 0 && (
            <div className="space-y-1.5 mb-3 pl-1">
              {stepHistory.map((entry) => (
                <div key={entry.step} className="flex items-center gap-2">
                  {entry.status === 'completed' ? (
                    <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  ) : entry.status === 'active' ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                  )}
                  <span className={`text-xs ${
                    entry.status === 'completed' ? 'text-green-400/80' :
                    entry.status === 'active' ? 'text-blue-400' :
                    'text-muted-foreground/40'
                  }`}>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              data-testid="update-progress-bar"
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${updateProgress?.progress ?? INITIAL_PROGRESS_PCT}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-blue-400/60">{t('settings.updates.doNotNavigate')}</p>
            <p data-testid="update-countdown" className="text-xs text-blue-400/60 tabular-nums">
              {countdown > 0
                ? t('settings.updates.estimatedRemaining', { seconds: countdown })
                : t('settings.updates.almostDone')}
            </p>
          </div>

          {/* Cancel button — aborts the in-flight update at the next step boundary.
              Disabled once the restart step has begun because startup-oauth.sh
              is already detached and cannot be stopped. */}
          <div className="mt-3 pt-3 border-t border-blue-500/20 flex items-center justify-between gap-3">
            <p className="text-xs text-blue-400/60 flex-1 min-w-0">
              {canCancel
                ? t('settings.updates.cancelHint')
                : t('settings.updates.cancelUnavailable')}
            </p>
            <button
              data-testid="update-cancel-button"
              type="button"
              onClick={async () => {
                if (cancelState === 'pending') return
                setCancelState('pending')
                setCancelError(null)
                const result = await cancelUpdate()
                if (!result.success) {
                  setCancelState('error')
                  setCancelError(result.error ?? t('settings.updates.cancelFailed'))
                }
              }}
              disabled={!canCancel || cancelState === 'pending'}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-medium hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {cancelState === 'pending' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('settings.updates.cancelling')}
                </>
              ) : (
                <>
                  <X className="w-3.5 h-3.5" />
                  {t('settings.updates.cancelUpdate')}
                </>
              )}
            </button>
          </div>
          {cancelState === 'error' && cancelError && (
            <div className="mt-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{cancelError}</p>
            </div>
          )}
        </div>
      )}

      {/* Update Cancelled banner — shown after the user cancels an in-progress update */}
      {updateProgress?.status === 'cancelled' && (
        <div data-testid="update-cancelled-banner" className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
              <div>
                <p className="text-sm text-yellow-400">{updateProgress.message}</p>
                <p className="text-xs text-yellow-400/70 mt-1">
                  {t('settings.updates.cancelledHint')}
                </p>
              </div>
            </div>
            <button
              data-testid="update-cancelled-dismiss"
              onClick={dismissProgress}
              className="text-yellow-400/60 hover:text-yellow-400 shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Update Complete/Failed */}
      {updateProgress?.status === 'done' && (
        <div data-testid="update-done-banner" className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <div>
                <p className="text-sm text-green-400">{updateProgress.message}</p>
                <button
                  data-testid="update-refresh-button"
                  onClick={() => {
                    emitUpdateRefreshed()
                    window.location.reload()
                  }}
                  className="text-xs text-green-400/80 hover:text-green-300 underline underline-offset-2 mt-1"
                >
                  {t('settings.updates.refreshToLoad')}
                </button>
              </div>
            </div>
            <button data-testid="update-done-dismiss" onClick={dismissProgress} disabled={isUpdating} className="text-green-400/60 hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {updateProgress?.status === 'failed' && (
        <div data-testid="update-failed-banner" className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <p className="text-sm text-red-400">{updateProgress.message}</p>
                {updateProgress.error && (
                  <p data-testid="update-failed-error" className="text-xs text-red-400/70 mt-1">{updateProgress.error}</p>
                )}
              </div>
            </div>
            <button data-testid="update-failed-dismiss" onClick={dismissProgress} disabled={isUpdating} className="text-red-400/60 hover:text-red-400 shrink-0 ml-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Version Status */}
      <div
        className={`p-4 rounded-lg mb-4 ${
          hasUpdate
            ? 'bg-green-500/10 border border-green-500/20'
            : error
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-secondary/30 border border-border'
        }`}
      >
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('settings.updates.currentVersion')}</span>
            <span className="text-sm font-mono text-foreground">
              {currentVersion}
              {commitHash !== 'unknown' && (
                <span className="text-muted-foreground"> ({commitHash.slice(0, 7)})</span>
              )}
            </span>
          </div>

          {/* Developer channel: show SHA info */}
          {isDeveloperChannel && (autoUpdateStatus || latestMainSHA) && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('settings.updates.currentSHA')}</span>
                <span className={`text-sm font-mono transition-colors duration-1000 ${shasMatch ? 'text-green-400 animate-pulse-once' : 'text-foreground'}`}>
                  {shortSHA(currentSHA)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('settings.updates.latestSHA')}</span>
                <span className={`text-sm font-mono transition-colors duration-1000 ${shasMatch ? 'text-green-400 animate-pulse-once' : 'text-foreground'}`}>
                  {shortSHA(latestSHA)}
                </span>
              </div>
            </>
          )}

          {/* Release channels: show tag info */}
          {!isDeveloperChannel && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('settings.updates.latestAvailable')}</span>
              <span className="text-sm font-mono text-foreground">
                {isChecking ? (
                  <span className="text-muted-foreground">{t('settings.updates.checking')}</span>
                ) : latestRelease ? (
                  latestRelease.tag
                ) : (
                  <span className="text-muted-foreground">{t('settings.updates.unknown')}</span>
                )}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('settings.updates.status')}</span>
            <span
              className={`text-sm font-medium ${
                hasUpdate
                  ? 'text-green-400'
                  : error
                    ? 'text-red-400'
                    : 'text-muted-foreground'
              }`}
            >
              {error
                ? t('settings.updates.errorChecking')
                : hasUpdate
                  ? t('settings.updates.updateAvailable')
                  : t('settings.updates.upToDate')}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('settings.updates.lastChecked')}</span>
            <span className="text-sm text-muted-foreground">{formatLastChecked()}</span>
          </div>
        </div>
        {error && !isUpdating && agentConnected && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 font-medium">{t('settings.updates.errorChecking')}</p>
            <p className="text-xs text-red-400/80 mt-1">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Try clicking &quot;Check Now&quot; to retry, or verify that kc-agent is running and network is available.
            </p>
          </div>
        )}
      </div>

      {/* Recent Commits (developer channel) — hidden during update */}
      {isDeveloperChannel && recentCommits.length > 0 && !isUpdating && (
        <CommitList commits={recentCommits} />
      )}

      {/* Update Now Button (when agent connected and update available) */}
      {hasUpdate && agentConnected && !isHelmInstall && !isUpdating && (
        <div className="mb-4">
          <button
            onClick={async () => {
              if (triggerGuardRef.current) return
              emitUpdateTriggered()
              triggerGuardRef.current = true
              triggerTimestampRef.current = Date.now()
              setTriggerState('triggered')
              setTriggerError(null)
              const result = await triggerUpdate()
              if (!result.success) {
                setTriggerState('error')
                setTriggerError(result.error ?? 'Unknown error')
                triggerGuardRef.current = false
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('settings.updates.updateNow')}
          </button>
          {triggerState === 'error' && triggerError && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{triggerError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Helm Self-Upgrade: Restarting overlay */}
      {(isSelfUpgradeRestarting || selfUpgradeRestartComplete || selfUpgradeRestartError) && (
        <div className="mb-4 p-4 rounded-lg border border-border bg-secondary/30">
          {isSelfUpgradeRestarting && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-green-400" />
              <p className="text-sm font-medium">{t('settings.updates.helmRestarting')}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.updates.helmRestartingDesc', { seconds: selfUpgradeRestartElapsed })}
              </p>
            </div>
          )}
          {selfUpgradeRestartComplete && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Check className="w-8 h-8 text-green-400" />
              <p className="text-sm font-medium">{t('settings.updates.helmRestartComplete')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.updates.helmRestartReloading')}</p>
            </div>
          )}
          {selfUpgradeRestartError && (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="text-sm font-medium text-red-400">{selfUpgradeRestartError}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
              >
                {t('settings.updates.helmRestartRefresh')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Helm Self-Upgrade Button (when self-upgrade available and update detected) */}
      {hasUpdate && isHelmInstall && selfUpgradeAvailable && !isUpdating && !isSelfUpgradeRestarting && !selfUpgradeRestartComplete && latestRelease && (
        <div className="mb-4">
          <button
            onClick={async () => {
              if (isSelfUpgrading) return
              const result = await triggerSelfUpgrade(latestRelease.tag)
              if (!result.success) {
                // Error is tracked in the hook's triggerError state
              }
            }}
            disabled={isSelfUpgrading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSelfUpgrading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isSelfUpgrading
              ? t('settings.updates.upgrading')
              : t('settings.updates.helmUpgradeNow', { tag: latestRelease.tag })}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            {t('settings.updates.helmUpgradeWarning')}
          </p>
          {selfUpgradeError && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{selfUpgradeError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Release Notes */}
      {latestRelease && latestRelease.releaseNotes && (
        <div className="mb-4">
          <button
            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {showReleaseNotes ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {t('settings.updates.releaseNotes')}
          </button>
          {showReleaseNotes && (
            <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border">
              <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
                {latestRelease.releaseNotes}
              </pre>
              <a
                href={latestRelease.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
              >
                {t('settings.updates.viewOnGithub')}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Developer channel: always show update instructions */}
      {isDeveloperChannel && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">{t('settings.updates.howToUpdate')}</h3>

          {/* Make Update */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequestArrow className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.devSourceUpdate')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.updates.devMakeUpdateDesc')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-secondary font-mono text-sm select-all">make update</code>
              <button
                onClick={() => copyCommand('make update', 'makeupdate')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'makeupdate' ? t('settings.updates.copied') : t('settings.updates.copy')}
              </button>
            </div>
          </div>

          {/* Coding Agent tip */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.devCodingAgent')}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.updates.devCodingAgentDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Non-developer channels: show update instructions when update available */}
      {!isDeveloperChannel && hasUpdate && (!agentConnected || !autoUpdateEnabled) && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">{t('settings.updates.howToUpdate')}</h3>

          {/* Web Console */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.webConsole')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.updates.webConsoleDesc')}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600"
            >
              <RefreshCw className="w-4 h-4" />
              {t('settings.updates.refreshBrowser')}
            </button>
          </div>

          {/* Local Agent */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.localAgentUpdate')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.updates.localAgentDesc')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {brewCommand}
              </code>
              <button
                onClick={() => copyCommand(brewCommand, 'brew')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'brew' ? t('settings.updates.copied') : t('settings.updates.copy')}
              </button>
            </div>
          </div>

          {/* Cluster Deployment */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Ship className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">
                {t('settings.updates.clusterDeployment')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.updates.clusterDeploymentDesc')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {helmCommand}
              </code>
              <button
                onClick={() => copyCommand(helmCommand, 'helm')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'helm' ? t('settings.updates.copied') : t('settings.updates.copy')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Single row in the environment prerequisites checklist */
function PrereqRow({
  ok,
  loading,
  label,
  okText,
  failText,
  fixText,
  onFix,
  icon,
}: {
  ok: boolean
  loading?: boolean
  label: string
  okText: string
  failText: string
  fixText?: string
  onFix?: () => void
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin-min" />
        ) : ok ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400">{okText}</span>
          </>
        ) : (
          <>
            <X className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-red-400">{failText}</span>
            {fixText && onFix && (
              <button
                onClick={onFix}
                className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 ml-1"
              >
                {fixText}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Collapsible list of recent commits between current and latest SHA */
function CommitList({ commits }: { commits: Array<{ sha: string; message: string; author: string; date: string }> }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-4 rounded-lg bg-secondary/30 border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitCommitHorizontal className="w-4 h-4 text-orange-400" />
          <span className="font-medium text-foreground">
            {t('settings.updates.recentCommits', { count: commits.length })}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border max-h-64 overflow-y-auto">
          {commits.map((commit) => {
            const prMatch = commit.message.match(/\(#(\d+)\)/)
            const url = prMatch
              ? `https://github.com/kubestellar/console/pull/${prMatch[1]}`
              : `https://github.com/kubestellar/console/commit/${commit.sha}`
            return (
              <a
                key={commit.sha}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-secondary/30 cursor-pointer no-underline"
              >
                <code className="text-xs font-mono text-orange-400 shrink-0 pt-0.5">{commit.sha.slice(0, 7)}</code>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{commit.message}</p>
                  <p className="text-xs text-muted-foreground">{commit.author} &middot; {formatCommitDate(commit.date)}</p>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Format ISO date to relative time for commit display */
function formatCommitDate(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return date.toLocaleDateString()
}
