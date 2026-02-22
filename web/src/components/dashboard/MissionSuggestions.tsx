import { useState, useEffect, useRef, startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, Clock, X, ChevronDown, Zap, AlertTriangle, Shield, Server, Scale, Activity, Wrench, Stethoscope } from 'lucide-react'
import { useMissionSuggestions, MissionSuggestion, MissionType } from '../../hooks/useMissionSuggestions'
import { useSnoozedMissions, formatTimeRemaining } from '../../hooks/useSnoozedMissions'
import { useMissions } from '../../hooks/useMissions'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { Skeleton } from '../ui/Skeleton'

const MISSION_ICONS: Record<MissionType, typeof Zap> = {
  scale: Scale,
  limits: Activity,
  restart: Zap,
  unavailable: AlertTriangle,
  security: Shield,
  health: Server,
  resource: Activity,
}

const PRIORITY_STYLES = {
  critical: {
    bg: 'bg-red-950',
    border: 'border-red-800',
    text: 'text-red-400',
    badge: 'bg-red-900',
  },
  high: {
    bg: 'bg-orange-950',
    border: 'border-orange-800',
    text: 'text-orange-400',
    badge: 'bg-orange-900',
  },
  medium: {
    bg: 'bg-yellow-950',
    border: 'border-yellow-800',
    text: 'text-yellow-400',
    badge: 'bg-yellow-900',
  },
  low: {
    bg: 'bg-blue-950',
    border: 'border-blue-800',
    text: 'text-blue-400',
    badge: 'bg-blue-900',
  },
}

export function MissionSuggestions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { suggestions, hasSuggestions, stats } = useMissionSuggestions()
  // Subscribe to snoozedMissions to trigger re-render when snooze state changes
  const { snoozeMission, dismissMission, getSnoozeRemaining, snoozedMissions } = useSnoozedMissions()
  const { startMission } = useMissions()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Check agent status for offline skeleton display
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode()

  // Force dependency on snoozedMissions for reactivity
  void snoozedMissions

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!expandedId) return

    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside the dropdown content
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExpandedId(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedId(null)
      }
    }

    // Use setTimeout to avoid closing immediately when clicking to open
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [expandedId])

  const handleAction = (e: React.MouseEvent, suggestion: MissionSuggestion) => {
    e.stopPropagation()
    e.preventDefault()

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
          context: suggestion.context,
        })
      }
    }, 0)
  }

  const handleRepair = (e: React.MouseEvent, suggestion: MissionSuggestion) => {
    e.stopPropagation()
    e.preventDefault()

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
        context: suggestion.context,
      })
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
      <div data-tour="mission-suggestions" className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
            <Lightbulb className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-medium">{t('dashboard.missions.actions')}</span>
          </div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" width={120} height={26} className="rounded-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!hasSuggestions) return null

  return (
    <div data-tour="mission-suggestions" className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
          <Lightbulb className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-medium">Actions:</span>
        </div>

        {/* Inline suggestion chips */}
        {suggestions.slice(0, 6).map((suggestion) => {
          const Icon = MISSION_ICONS[suggestion.type]
          const style = PRIORITY_STYLES[suggestion.priority]
          const isExpanded = expandedId === suggestion.id
          const isProcessing = processingId === suggestion.id
          const snoozeRemaining = getSnoozeRemaining(suggestion.id)

          return (
            <div key={suggestion.id} className="relative">
              {/* Compact chip */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : suggestion.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all hover:scale-105 ${style.border} ${style.bg} ${style.text}`}
              >
                <Icon className="w-3 h-3" />
                <span className="max-w-[150px] truncate">{suggestion.title}</span>
                {suggestion.priority === 'critical' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {isProcessing && <div className="spinner w-3 h-3" />}
                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded dropdown */}
              {isExpanded && (
                <div
                  ref={dropdownRef}
                  className={`absolute top-full left-0 mt-1 z-50 w-72 rounded-lg border ${style.border} bg-card shadow-xl`}
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
                      <div className="text-xs text-purple-400 mb-2">
                        {t('dashboard.missions.snoozedFor', { time: formatTimeRemaining(snoozeRemaining) })}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={(e) => handleAction(e, suggestion)}
                        disabled={isProcessing}
                        className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                          suggestion.priority === 'critical'
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : suggestion.priority === 'high'
                            ? 'bg-orange-500 hover:bg-orange-600 text-white'
                            : 'bg-purple-500 hover:bg-purple-600 text-white'
                        } disabled:opacity-50`}
                      >
                        <Stethoscope className="w-3 h-3" />
                        {suggestion.action.label}
                      </button>
                      <button
                        onClick={(e) => handleRepair(e, suggestion)}
                        disabled={isProcessing}
                        className="px-2 py-1.5 rounded text-xs font-medium bg-green-900 hover:bg-green-800 text-green-400 transition-colors flex items-center gap-1"
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

        {/* Stats badges */}
        {stats.critical > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-red-950 text-red-400 text-[10px]">
            {t('dashboard.missions.critical', { count: stats.critical })}
          </span>
        )}
        {stats.high > 0 && stats.critical === 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-orange-950 text-orange-400 text-[10px]">
            {t('dashboard.missions.high', { count: stats.high })}
          </span>
        )}

        {suggestions.length > 6 && (
          <span className="text-[10px] text-muted-foreground">
            {t('dashboard.missions.moreDetails', { count: suggestions.length - 6 })}
          </span>
        )}
      </div>
    </div>
  )
}
