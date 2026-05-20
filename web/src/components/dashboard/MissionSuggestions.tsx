import { useState, useEffect, useRef, startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, ChevronDown, ChevronUp, Zap, AlertTriangle, Shield, Server, Scale, Activity, Timer } from 'lucide-react'
import { useMissionSuggestions, MissionSuggestion, MissionType } from '../../hooks/useMissionSuggestions'
import { useSnoozedMissions } from '../../hooks/useSnoozedMissions'
import { useMissions } from '../../hooks/useMissions'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useMissionSuggestionsTimer } from '../../hooks/useMissionSuggestionsTimer'
import { Skeleton } from '../ui/Skeleton'
import { StatusBadge } from '../ui/StatusBadge'
import { MissionActionPanel } from './MissionActionPanel'
import { emitMissionSuggestionsShown, emitMissionSuggestionActioned } from '../../lib/analytics'
import { safeSetItem } from '../../lib/utils/localStorage'


/** localStorage key to persist that the user has seen (and auto-collapsed) the panel */
const STORAGE_KEY_MISSIONS_COLLAPSED = 'kc-missions-collapsed'

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
  const analyticsEmittedRef = useRef(false)
  const mountedRef = useRef(true)
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
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode() && !wasAgentEverConnected()

  // Force dependency on snoozedMissions for reactivity
  void snoozedMissions

  // Timer hook for auto-collapse countdown
  const { countdown, handleMouseEnter, handleMouseLeave } = useMissionSuggestionsTimer({
    minimized,
    hasSuggestions,
    onAutoCollapse: () => setMinimized(true),
  })

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

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
      if (!mountedRef.current) return
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
      if (!mountedRef.current) return
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
                <MissionActionPanel
                  suggestion={suggestion}
                  isExpanded={isExpanded}
                  isProcessing={isProcessing}
                  snoozeRemaining={snoozeRemaining}
                  onAction={handleAction}
                  onRepair={handleRepair}
                  onSnooze={handleSnooze}
                  onDismiss={handleDismiss}
                />
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
              <MissionActionPanel
                suggestion={suggestion}
                isExpanded={isExpanded}
                isProcessing={isProcessing}
                snoozeRemaining={snoozeRemaining}
                onAction={handleAction}
                onRepair={handleRepair}
                onSnooze={handleSnooze}
                onDismiss={handleDismiss}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
