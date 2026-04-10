import { useState, useEffect, useRef, useCallback, startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, Clock, X, ChevronDown, ChevronUp, Zap, AlertTriangle, Shield, Server, Scale, Activity, Wrench, Stethoscope, Timer } from 'lucide-react'
import { useMissionSuggestions, MissionSuggestion, MissionType } from '../../hooks/useMissionSuggestions'
import { useSnoozedMissions, formatTimeRemaining } from '../../hooks/useSnoozedMissions'
import { useMissions } from '../../hooks/useMissions'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { Skeleton } from '../ui/Skeleton'
import { StatusBadge } from '../ui/StatusBadge'
import { emitMissionSuggestionsShown, emitMissionSuggestionActioned } from '../../lib/analytics'
import { safeSetItem } from '../../lib/utils/localStorage'

/** localStorage key to persist that the user has seen (and auto-collapsed) the panel */
const STORAGE_KEY_MISSIONS_COLLAPSED = 'kc-missions-collapsed'

/** Seconds before the panel auto-collapses */
const AUTO_COLLAPSE_SECONDS = 20
/** Interval between each countdown tick in milliseconds (1 second) */
const COUNTDOWN_TICK_MS = 1000

const MISSION_ICONS: Record<MissionType, typeof Zap> = {
  scale: Scale,
  limits: Activity,
  restart: Zap,
  unavailable: AlertTriangle,
  security: Shield,
  health: Server,
  resource: Activity }

/** Neutral card-gray styling for all priority levels */
const CHIP_STYLE = {
  bg: 'bg-secondary/50',
  border: 'border-border/50',
  text: 'text-foreground' }

export function MissionSuggestions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { suggestions, hasSuggestions, stats } = useMissionSuggestions()
  // Subscribe to snoozedMissions to trigger re-render when snooze state changes
  const { snoozeMission, dismissMission, getSnoozeRemaining, snoozedMissions } = useSnoozedMissions()
  const { startMission } = useMissions()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(true)
  const [countdown, setCountdown] = useState(AUTO_COLLAPSE_SECONDS)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyticsEmittedRef = useRef(false)
  // Refs to each chip trigger button, keyed by suggestion id.
  // Used so the outside-click listener can ignore clicks on the trigger itself
  // (the trigger's own onClick handles toggling). Without this, clicking the
  // chevron to close races the listener, which sets expandedId=null first,
  // then the onClick sees isExpanded=false and reopens the dropdown (#6050).
  const triggerRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())

  // Check agent status for offline skeleton display
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode()

  // Force dependency on snoozedMissions for reactivity
  void snoozedMissions

  // Start / stop countdown timer
  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          countdownRef.current = null
          setMinimized(true)
          // Timer-initiated collapse: do NOT persist to localStorage.
          // Only user-initiated minimize (explicit click) persists state.
          // This allows the panel to re-expand on next session/page load.
          return AUTO_COLLAPSE_SECONDS
        }
        return prev - 1
      })
    }, COUNTDOWN_TICK_MS)
  }, [])

  // Manage countdown lifecycle based on minimized state
  useEffect(() => {
    if (!minimized && hasSuggestions) {
      setCountdown(AUTO_COLLAPSE_SECONDS)
      startCountdown()
    } else if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [minimized, hasSuggestions, startCountdown])

  // Pause countdown on hover, resume on leave
  const handleMouseEnter = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }

  const handleMouseLeave = () => {
    if (!minimized) startCountdown()
  }

  // Emit analytics once when panel first renders with suggestions
  useEffect(() => {
    if (!analyticsEmittedRef.current && hasSuggestions && suggestions.length > 0) {
      analyticsEmittedRef.current = true
      emitMissionSuggestionsShown(suggestions.length, stats.critical)
    }
  }, [hasSuggestions, suggestions.length, stats.critical])

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!expandedId) return

    const handleClickOutside = (e: MouseEvent) => {
      // Use the currently expanded ID to find the correct dropdown element
      const activeDropdown = document.getElementById(`mission-dropdown-${expandedId}`)
      // Ignore clicks on the trigger button itself — its onClick handles
      // toggling. Otherwise, clicking the chevron to close races this
      // listener and the dropdown reopens (#6050).
      const activeTrigger = triggerRefs.current.get(expandedId)
      if (activeTrigger && activeTrigger.contains(e.target as Node)) return
      if (activeDropdown && !activeDropdown.contains(e.target as Node)) {
        setExpandedId(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedId(null)
      }
    }

    // Use setTimeout to avoid closing immediately when clicking to open.
    // Store the timer ID so we can cancel it if the effect re-runs or unmounts
    // before the callback fires — otherwise listeners attach after cleanup (#4660).
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      clearTimeout(timerId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [expandedId])

  const handleAction = (e: React.MouseEvent, suggestion: MissionSuggestion) => {
    e.stopPropagation()
    e.preventDefault()

    emitMissionSuggestionActioned(suggestion.type, suggestion.priority, 'investigate')

    // Batch state updates to prevent flicker
    startTransition(() => {
      setExpandedId(null)
      setProcessingId(null)
    })
    dismissMission(suggestion.id) // Permanently remove tile after starting action

    // Execute action after dropdown closes
    setTimeout(() => {
      if (suggestion.action.type === 'navigate') {
        navigate(suggestion.action.target)
      } else if (suggestion.action.type === 'ai') {
        startMission({
          title: suggestion.title,
          description: suggestion.description,
          type: suggestion.type === 'security' ? 'analyze' : 'troubleshoot',
          initialPrompt: suggestion.action.target,
          context: suggestion.context })
      }
    }, 0)
  }

  const handleRepair = (e: React.MouseEvent, suggestion: MissionSuggestion) => {
    e.stopPropagation()
    e.preventDefault()

    emitMissionSuggestionActioned(suggestion.type, suggestion.priority, 'repair')

    // Batch state updates to prevent flicker
    startTransition(() => {
      setExpandedId(null)
      setProcessingId(null)
    })
    dismissMission(suggestion.id) // Permanently remove tile after starting repair

    // Start mission after dropdown closes
    setTimeout(() => {
      startMission({
        title: t('dashboard.missions.repairPrefix', { title: suggestion.title }),
        description: t('dashboard.missions.autoRepairPrefix', { description: suggestion.description }),
        type: 'repair',
        initialPrompt: t('dashboard.missions.repairPrompt', { target: suggestion.action.target }),
        context: suggestion.context })
    }, 0)
  }

  const handleSnooze = (e: React.MouseEvent, suggestion: MissionSuggestion) => {
    e.stopPropagation()
    snoozeMission(suggestion)
    setExpandedId(null)
  }

  const handleDismiss = (e: React.MouseEvent, suggestion: MissionSuggestion) => {
    e.stopPropagation()
    dismissMission(suggestion.id)
    setExpandedId(null)
  }

  // Show skeleton when agent is offline and demo mode is OFF
  if (forceSkeletonForOffline) {
    return (
      <div data-tour="mission-suggestions" className="mb-4 glass rounded-xl border border-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <Lightbulb className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{t('dashboard.missions.actions')}</span>
        </div>
        <div className="flex flex-wrap gap-2 p-3 pt-0">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" width={140} height={30} className="rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!hasSuggestions) return null

  // Minimized inline view — label + pills on one row
  if (minimized) {
    return (
      <div data-tour="mission-suggestions" className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setMinimized(false)}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mr-1"
          >
            <Lightbulb className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Recommended Actions:</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {suggestions.slice(0, 6).map((suggestion) => {
            const Icon = MISSION_ICONS[suggestion.type]
            const isExpanded = expandedId === suggestion.id
            const isProcessing = processingId === suggestion.id
            const snoozeRemaining = getSnoozeRemaining(suggestion.id)
            return (
              <div key={suggestion.id} className="relative">
                <button
                  ref={(el) => {
                    if (el) triggerRefs.current.set(suggestion.id, el)
                    else triggerRefs.current.delete(suggestion.id)
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : suggestion.id)}
                  aria-expanded={isExpanded}
                  aria-haspopup="menu"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all hover:scale-105 ${CHIP_STYLE.border} ${CHIP_STYLE.bg} ${CHIP_STYLE.text}`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="max-w-[150px] truncate">{suggestion.title}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Inline dropdown — appears below the chip without expanding the panel */}
                {isExpanded && (
                  <div
                    id={`mission-dropdown-${suggestion.id}`}
                    role="menu"
                    className="absolute top-full left-0 mt-1 z-dropdown w-72 rounded-lg border border-border/50 bg-card shadow-xl"
                    style={{ isolation: 'isolate' }}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                      e.preventDefault()
                      const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')
                      const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                      if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                      else items[Math.max(idx - 1, 0)]?.focus()
                    }}
                  >
                    <div className="p-3">
                      <p className="text-xs text-muted-foreground mb-2">{suggestion.description}</p>
                      {suggestion.context.details && suggestion.context.details.length > 0 && (
                        <div className="text-xs text-muted-foreground mb-3 max-h-20 overflow-y-auto">
                          <ul className="ml-3 list-disc space-y-0.5">
                            {suggestion.context.details.slice(0, 3).map((detail, idx) => (
                              <li key={idx} className="truncate">{detail}</li>
                            ))}
                            {suggestion.context.details.length > 3 && (
                              <li className="text-muted-foreground/70">
                                {t('dashboard.missions.moreDetails', { count: suggestion.context.details.length - 3 })}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {snoozeRemaining && snoozeRemaining > 0 && (
                        <div className="text-xs text-muted-foreground mb-2">
                          {t('dashboard.missions.snoozedFor', { time: formatTimeRemaining(snoozeRemaining) })}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={(e) => handleAction(e, suggestion)}
                          disabled={isProcessing}
                          className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 bg-primary hover:bg-primary/80 text-white disabled:opacity-50"
                        >
                          <Stethoscope className="w-3 h-3" />
                          {suggestion.action.label}
                        </button>
                        <button
                          onClick={(e) => handleRepair(e, suggestion)}
                          disabled={isProcessing}
                          className="px-2 py-1.5 rounded text-xs font-medium bg-secondary/50 hover:bg-secondary text-foreground transition-colors flex items-center gap-1"
                          title={t('dashboard.missions.repairTitle')}
                        >
                          <Wrench className="w-3 h-3" />
                          {t('dashboard.missions.repair')}
                        </button>
                        <button
                          onClick={(e) => handleSnooze(e, suggestion)}
                          disabled={isProcessing}
                          className="px-2 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
                          title={t('dashboard.missions.snoozeTitle')}
                        >
                          <Clock className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDismiss(e, suggestion)}
                          disabled={isProcessing}
                          className="px-2 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
                          title={t('dashboard.missions.dismiss')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {stats.critical > 0 && (
            <StatusBadge color="red" size="xs" rounded="full">
              {t('dashboard.missions.critical', { count: stats.critical })}
            </StatusBadge>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      data-tour="mission-suggestions"
      className="mb-4 glass rounded-xl border border-border/50"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {t('dashboard.missions.actions')}
          </span>
          {stats.critical > 0 && (
            <StatusBadge color="red" size="xs" rounded="full">
              {t('dashboard.missions.critical', { count: stats.critical })}
            </StatusBadge>
          )}
          {stats.high > 0 && stats.critical === 0 && (
            <StatusBadge color="orange" size="xs" rounded="full">
              {t('dashboard.missions.high', { count: stats.high })}
            </StatusBadge>
          )}
          {suggestions.length > 6 && (
            <span className="text-2xs text-muted-foreground">
              {t('dashboard.missions.moreDetails', { count: suggestions.length - 6 })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-2xs text-muted-foreground/60 tabular-nums">
            <Timer className="w-3 h-3" />
            {countdown}s
          </span>
          <button
            onClick={() => { setMinimized(true); safeSetItem(STORAGE_KEY_MISSIONS_COLLAPSED, 'true') }}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Minimize"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Action chips */}
      <div className="flex flex-wrap gap-2 p-3">
        {suggestions.slice(0, 6).map((suggestion) => {
          const Icon = MISSION_ICONS[suggestion.type]
          const isExpanded = expandedId === suggestion.id
          const isProcessing = processingId === suggestion.id
          const snoozeRemaining = getSnoozeRemaining(suggestion.id)

          return (
            <div key={suggestion.id} className="relative">
              {/* Compact chip */}
              <button
                ref={(el) => {
                  if (el) triggerRefs.current.set(suggestion.id, el)
                  else triggerRefs.current.delete(suggestion.id)
                }}
                onClick={() => setExpandedId(isExpanded ? null : suggestion.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all hover:brightness-110 ${CHIP_STYLE.border} ${CHIP_STYLE.bg} ${CHIP_STYLE.text}`}
              >
                <Icon className="w-3 h-3" />
                <span className="max-w-[180px] truncate">{suggestion.title}</span>
                {isProcessing && <div className="spinner w-3 h-3" />}
                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded dropdown */}
              {isExpanded && (
                <div
                  id={`mission-dropdown-${suggestion.id}`}
                  role="menu"
                  className="absolute top-full left-0 mt-1 z-dropdown w-72 rounded-lg border border-border/50 bg-card shadow-xl"
                  style={{ isolation: 'isolate' }}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                    e.preventDefault()
                    const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')
                    const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                    if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                    else items[Math.max(idx - 1, 0)]?.focus()
                  }}
                >
                  <div className="p-3">
                    {/* Description */}
                    <p className="text-xs text-muted-foreground mb-2">{suggestion.description}</p>

                    {/* Context details */}
                    {suggestion.context.details && suggestion.context.details.length > 0 && (
                      <div className="text-xs text-muted-foreground mb-3 max-h-20 overflow-y-auto">
                        <ul className="ml-3 list-disc space-y-0.5">
                          {suggestion.context.details.slice(0, 3).map((detail, idx) => (
                            <li key={idx} className="truncate">{detail}</li>
                          ))}
                          {suggestion.context.details.length > 3 && (
                            <li className="text-muted-foreground/70">
                              {t('dashboard.missions.moreDetails', { count: suggestion.context.details.length - 3 })}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {snoozeRemaining && snoozeRemaining > 0 && (
                      <div className="text-xs text-muted-foreground mb-2">
                        {t('dashboard.missions.snoozedFor', { time: formatTimeRemaining(snoozeRemaining) })}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={(e) => handleAction(e, suggestion)}
                        disabled={isProcessing}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 bg-primary hover:bg-primary/80 text-white disabled:opacity-50"
                      >
                        <Stethoscope className="w-3 h-3" />
                        {suggestion.action.label}
                      </button>
                      <button
                        onClick={(e) => handleRepair(e, suggestion)}
                        disabled={isProcessing}
                        className="px-2 py-1.5 rounded text-xs font-medium bg-secondary/50 hover:bg-secondary text-foreground transition-colors flex items-center gap-1"
                        title={t('dashboard.missions.repairTitle')}
                      >
                        <Wrench className="w-3 h-3" />
                        {t('dashboard.missions.repair')}
                      </button>
                      <button
                        onClick={(e) => handleSnooze(e, suggestion)}
                        className="px-2 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors"
                        title={t('dashboard.missions.snoozeTitle')}
                      >
                        <Clock className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDismiss(e, suggestion)}
                        className="px-2 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors"
                        title={t('dashboard.missions.dismiss')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
