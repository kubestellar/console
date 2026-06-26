import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModal } from '../../hooks/useModal'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpdateProgress } from '../../hooks/useUpdateProgress'
import { useSelfUpgrade } from '../../hooks/useSelfUpgrade'
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
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'

/** Minimum spin duration to guarantee one full rotation (matches cards) */
const MIN_SPIN_DURATION = 1000

/** Initial progress bar percentage shown before WebSocket messages arrive */
export const INITIAL_PROGRESS_PCT = 5

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

export function useUpdateSettingsState() {
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

  const { progress: updateProgress, stepHistory, dismiss: dismissProgress } = useUpdateProgress()
  const { isAuthenticated } = useAuth()
  const oauthConfigured = isAuthenticated

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

  const channelOptions: { value: UpdateChannel; label: string; description: string; devOnly?: boolean }[] = [
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

  const visibleChannels = channelOptions.filter((option) => !option.devOnly || installMethod === 'dev')

  const releaseNotes = useModal()
  const prereqs = useModal()
  const scopeInfo = useModal()
  const channelDropdown = useModal()

  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [triggerState, setTriggerState] = useState<'idle' | 'triggered' | 'error'>('idle')
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [cancelState, setCancelState] = useState<'idle' | 'pending' | 'error'>('idle')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(ESTIMATED_UPDATE_SECS)
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)

  const triggerGuardRef = useRef(false)
  const triggerTimestampRef = useRef(0)
  const spinStartRef = useRef<number | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountCheckDoneRef = useRef(false)

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
      }

      setIsVisuallySpinning(false)
      spinStartRef.current = null
    }
  }, [isChecking])

  useEffect(() => {
    if (mountCheckDoneRef.current) return
    mountCheckDoneRef.current = true
    forceCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!lastCheckResult) return
    const timer = setTimeout(() => clearLastCheckResult(), CHECK_RESULT_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [lastCheckResult, clearLastCheckResult])

  useEffect(() => {
    if (updateProgress && triggerState === 'triggered') {
      setTriggerState('idle')
    }

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
      triggerGuardRef.current = false
      setCancelState('idle')
      setCancelError(null)
    }
  }, [updateProgress, triggerState])

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

  const isDeveloperChannel = channel === 'developer'
  const isHelmInstall = installMethod === 'helm'
  const isWsUpdating = Boolean(updateProgress && !['idle', 'done', 'failed', 'cancelled'].includes(updateProgress.status))
  const isUpdating = isWsUpdating || triggerState === 'triggered'

  const RESTART_STEP_NUMBER = 6
  const canCancel = Boolean(
    isUpdating
      && updateProgress
      && updateProgress.status !== 'restarting'
      && (updateProgress.step === undefined || updateProgress.step < RESTART_STEP_NUMBER)
  )

  useEffect(() => {
    if (!isUpdating) return
    setCountdown(ESTIMATED_UPDATE_SECS)
    const id = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1))
    }, COUNTDOWN_TICK_MS)
    return () => clearInterval(id)
  }, [isUpdating])

  const currentSHA = autoUpdateStatus?.currentSHA ?? commitHash
  const latestSHA = autoUpdateStatus?.latestSHA ?? latestMainSHA ?? ''
  const shasMatch = Boolean(
    isDeveloperChannel
      && currentSHA
      && latestSHA
      && currentSHA.startsWith(latestSHA.slice(0, 7))
  )

  const helmCommand = latestRelease
    ? `helm upgrade kc kubestellar-console/kubestellar-console --version ${latestRelease.tag.replace(/^v/, '')} -n kc`
    : 'helm upgrade kc kubestellar-console/kubestellar-console -n kc'

  const brewCommand = 'brew upgrade kubestellar/tap/kc-agent'

  const handleCheckNow = () => {
    emitUpdateChecked()
    forceCheck()
  }

  const handleSelectChannel = (nextChannel: UpdateChannel) => {
    setChannel(nextChannel)
    channelDropdown.close()
  }

  const handleToggleAutoUpdate = () => {
    setAutoUpdateEnabled(!autoUpdateEnabled)
  }

  const handleCopyCommand = async (command: string, id: string) => {
    await copyToClipboard(command)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    setCopiedCommand(id)
    copyTimeoutRef.current = setTimeout(() => setCopiedCommand(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const handleCancelUpdate = async () => {
    if (cancelState === 'pending') return
    setCancelState('pending')
    setCancelError(null)
    const result = await cancelUpdate()
    if (!result.success) {
      setCancelState('error')
      setCancelError(result.error ?? t('settings.updates.cancelFailed'))
      return
    }
    setCancelState('idle')
  }

  const handleTriggerUpdate = async () => {
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
      return
    }
    triggerGuardRef.current = false
  }

  const handleTriggerSelfUpgrade = async () => {
    if (!latestRelease || isSelfUpgrading) return
    await triggerSelfUpgrade(latestRelease.tag)
  }

  const handleRefreshToLoad = () => {
    emitUpdateRefreshed()
    window.location.reload()
  }

  const handleReloadWindow = () => {
    window.location.reload()
  }

  const handleOpenAgentSettings = () => {
    scrollToSettingsSection('agent-settings')
  }

  const formatLastChecked = () => {
    if (!lastChecked) return t('settings.updates.never')
    const now = Date.now()
    const diff = now - lastChecked
    if (diff < MS_PER_MINUTE) return t('settings.updates.justNow')
    if (diff < MS_PER_HOUR) return t('settings.updates.minutesAgo', { count: Math.floor(diff / MS_PER_MINUTE) })
    if (diff < MS_PER_DAY) return t('settings.updates.hoursAgo', { count: Math.floor(diff / MS_PER_HOUR) })
    return new Date(lastChecked).toLocaleDateString()
  }

  const shortSHA = (sha: string) => (sha ? sha.slice(0, 7) : '—')

  return {
    t,
    currentVersion,
    commitHash,
    channel,
    latestRelease,
    hasUpdate,
    isChecking,
    error,
    lastCheckResult,
    autoUpdateEnabled,
    installMethod,
    autoUpdateStatus,
    agentConnected,
    hasCodingAgent,
    latestMainSHA,
    recentCommits,
    updateProgress,
    stepHistory,
    selfUpgradeAvailable,
    isSelfUpgrading,
    selfUpgradeError,
    isSelfUpgradeRestarting,
    selfUpgradeRestartComplete,
    selfUpgradeRestartError,
    selfUpgradeRestartElapsed,
    visibleChannels,
    releaseNotes,
    prereqs,
    scopeInfo,
    channelDropdown,
    copiedCommand,
    triggerState,
    triggerError,
    cancelState,
    cancelError,
    countdown,
    isVisuallySpinning,
    oauthConfigured,
    helmCommand,
    brewCommand,
    isDeveloperChannel,
    isHelmInstall,
    isUpdating,
    canCancel,
    currentSHA,
    latestSHA,
    shasMatch,
    formatLastChecked,
    shortSHA,
    dismissProgress,
    handleCheckNow,
    handleSelectChannel,
    handleToggleAutoUpdate,
    handleCopyCommand,
    handleCancelUpdate,
    handleTriggerUpdate,
    handleTriggerSelfUpgrade,
    handleRefreshToLoad,
    handleReloadWindow,
    handleOpenAgentSettings,
  }
}

export type UpdateSettingsState = ReturnType<typeof useUpdateSettingsState>
