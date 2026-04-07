import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, ChevronDown, ChevronUp, X, Plus, AlertTriangle, Info, Lightbulb, Timer } from 'lucide-react'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardRecommendations, CardRecommendation } from '../../hooks/useCardRecommendations'
import { useSnoozedRecommendations } from '../../hooks/useSnoozedRecommendations'
import { AI_THINKING_DELAY_MS } from '../../lib/constants/network'
import { emitCardRecommendationsShown, emitCardRecommendationActioned } from '../../lib/analytics'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'

/** localStorage key to persist that the user has seen (and auto-collapsed) the panel */
const STORAGE_KEY_RECS_COLLAPSED = 'kc-recommendations-collapsed'

interface Props {
  currentCardTypes: string[]
  onAddCard: (cardType: string, config?: Record<string, unknown>) => void
}

/** Seconds before the panel auto-collapses */
const AUTO_COLLAPSE_SECONDS = 20
/** Interval between each countdown tick in milliseconds (1 second) */
const COUNTDOWN_TICK_MS = 1000

/** Neutral card-gray styling for all priority levels */
const CHIP_STYLE = {
  bg: 'bg-secondary/50',
  border: 'border-border/50',
  text: 'text-foreground' }

export function CardRecommendations({ currentCardTypes, onAddCard }: Props) {
  const { t } = useTranslation()
  const { recommendations, hasRecommendations, highPriorityCount } = useCardRecommendations(currentCardTypes)
  // Subscribe to snoozedRecommendations to trigger re-render when snooze state changes
  const { snoozeRecommendation, dismissRecommendation, isSnoozed, isDismissed, snoozedRecommendations } = useSnoozedRecommendations()
  const [expandedRec, setExpandedRec] = useState<string | null>(null)
  const [addingCard, setAddingCard] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(() =>
    safeGetItem(STORAGE_KEY_RECS_COLLAPSED) === 'true'
  )
  const [countdown, setCountdown] = useState(AUTO_COLLAPSE_SECONDS)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyticsEmittedRef = useRef(false)

  // Force dependency on snoozedRecommendations for reactivity
  void snoozedRecommendations

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
    if (!minimized) {
      setCountdown(AUTO_COLLAPSE_SECONDS)
      startCountdown()
    } else if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [minimized, startCountdown])

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

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!expandedRec) return

    const handleClickOutside = (e: MouseEvent) => {
      // Use the currently expanded ID to find the correct dropdown element
      const activeDropdown = document.getElementById(`rec-dropdown-${expandedRec}`)
      if (activeDropdown && !activeDropdown.contains(e.target as Node)) {
        setExpandedRec(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedRec(null)
      }
    }

    // Use setTimeout to avoid closing immediately when clicking to open.
    // Store the timer ID so we can cancel it if the effect re-runs or unmounts
    // before the callback fires — otherwise listeners attach after cleanup (#4661).
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      clearTimeout(timerId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [expandedRec])

  const handleAddCard = async (rec: CardRecommendation) => {
    setAddingCard(rec.id)
    await new Promise(resolve => setTimeout(resolve, AI_THINKING_DELAY_MS))
    onAddCard(rec.cardType, rec.config)
    emitCardRecommendationActioned(rec.cardType, rec.priority)
    setAddingCard(null)
    setExpandedRec(null)
    dismissRecommendation(rec.id) // Permanently hide tile after adding card
  }

  const handleSnooze = (e: React.MouseEvent, rec: CardRecommendation) => {
    e.stopPropagation()
    snoozeRecommendation(rec)
    setExpandedRec(null)
  }

  const handleDismiss = (e: React.MouseEvent, rec: CardRecommendation) => {
    e.stopPropagation()
    dismissRecommendation(rec.id)
    setExpandedRec(null)
  }

  // Filter out snoozed and dismissed recommendations
  const visibleRecommendations = recommendations.filter(rec => !isSnoozed(rec.id) && !isDismissed(rec.id))

  // Emit analytics once when panel first renders with visible recommendations
  useEffect(() => {
    if (!analyticsEmittedRef.current && visibleRecommendations.length > 0) {
      analyticsEmittedRef.current = true
      emitCardRecommendationsShown(visibleRecommendations.length, highPriorityCount)
    }
  }, [visibleRecommendations.length, highPriorityCount])

  if (!hasRecommendations || visibleRecommendations.length === 0) return null

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return AlertTriangle
      case 'medium': return Info
      default: return Lightbulb
    }
  }

  // Minimized inline view — label + pills on one row
  // Clicking a chip shows a dropdown tooltip inline without expanding the full panel
  if (minimized) {
    return (
      <div data-tour="recommendations" className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setMinimized(false)}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mr-1"
          >
            <Lightbulb className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Recommended Cards:</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {visibleRecommendations.slice(0, 6).map((rec) => {
            const Icon = getPriorityIcon(rec.priority)
            const isExpanded = expandedRec === rec.id
            const isAdding = addingCard === rec.id
            return (
              <div key={rec.id} className="relative">
                <button
                  onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                  aria-expanded={isExpanded}
                  aria-haspopup="menu"
                  aria-controls={isExpanded ? `rec-dropdown-${rec.id}` : undefined}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all hover:scale-105 ${CHIP_STYLE.border} ${CHIP_STYLE.bg} ${CHIP_STYLE.text}`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="max-w-[150px] truncate">{rec.title}</span>
                  {isAdding && <div className="spinner w-3 h-3" />}
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Inline dropdown — appears below the chip without expanding the panel */}
                {isExpanded && (
                  <div
                    id={`rec-dropdown-${rec.id}`}
                    role="menu"
                    className="absolute top-full left-0 mt-1 z-dropdown w-72 rounded-lg border border-border/50 bg-card shadow-xl"
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
                      <div className="text-xs text-muted-foreground mb-2">{rec.reason}</div>
                      <div className="text-xs text-muted-foreground mb-3">
                        <ul className="ml-3 list-disc space-y-0.5">
                          <li>{t('dashboard.recommendations.addCard', { title: rec.title })}</li>
                          <li>{t('dashboard.recommendations.showRealTimeData')}</li>
                          {rec.priority === 'high' && <li>{t('dashboard.recommendations.addressCriticalIssues')}</li>}
                        </ul>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Plus className="w-3 h-3" />}
                          loading={isAdding}
                          onClick={() => handleAddCard(rec)}
                          className="flex-1"
                        >
                          {isAdding ? t('dashboard.recommendations.adding') : t('buttons.addCard')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Clock className="w-3 h-3" />}
                          onClick={(e) => handleSnooze(e, rec)}
                          title={t('dashboard.recommendations.snooze')}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<X className="w-3 h-3" />}
                          onClick={(e) => handleDismiss(e, rec)}
                          title={t('dashboard.recommendations.dismiss')}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {highPriorityCount > 0 && (
            <StatusBadge color="red" size="xs" rounded="full">
              {t('dashboard.recommendations.critical', { count: highPriorityCount })}
            </StatusBadge>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      data-tour="recommendations"
      className="mb-4 glass rounded-xl border border-border/50"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {t('dashboard.recommendations.ai')}
          </span>
          {highPriorityCount > 0 && (
            <StatusBadge color="red" size="xs" rounded="full">
              {t('dashboard.recommendations.critical', { count: highPriorityCount })}
            </StatusBadge>
          )}
          {visibleRecommendations.length > 6 && (
            <span className="text-2xs text-muted-foreground">
              {t('dashboard.recommendations.more', { count: visibleRecommendations.length - 6 })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-2xs text-muted-foreground/60 tabular-nums">
            <Timer className="w-3 h-3" />
            {countdown}s
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronUp className="w-3.5 h-3.5" />}
            onClick={() => { setMinimized(true); safeSetItem(STORAGE_KEY_RECS_COLLAPSED, 'true') }}
            title="Minimize"
            className="p-1"
          />
        </div>
      </div>

      {/* Recommendation chips */}
      <div className="flex flex-wrap gap-2 p-3">
        {visibleRecommendations.slice(0, 6).map((rec) => {
          const isExpanded = expandedRec === rec.id
          const isAdding = addingCard === rec.id
          const Icon = getPriorityIcon(rec.priority)

          return (
            <div key={rec.id} className="relative">
              {/* Compact chip */}
              <button
                onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all hover:brightness-110 ${CHIP_STYLE.border} ${CHIP_STYLE.bg} ${CHIP_STYLE.text}`}
              >
                <Icon className="w-3 h-3" />
                <span className="max-w-[180px] truncate">{rec.title}</span>
                {isAdding && <div className="spinner w-3 h-3" />}
                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded dropdown */}
              {isExpanded && (
                <div
                  id={`rec-dropdown-${rec.id}`}
                  role="menu"
                  className="absolute top-full left-0 mt-1 z-dropdown w-72 rounded-lg border border-border/50 bg-card shadow-xl"
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
                    {/* Reason */}
                    <div className="text-xs text-muted-foreground mb-2">{rec.reason}</div>

                    {/* What this will do */}
                    <div className="text-xs text-muted-foreground mb-3">
                      <ul className="ml-3 list-disc space-y-0.5">
                        <li>{t('dashboard.recommendations.addCard', { title: rec.title })}</li>
                        <li>{t('dashboard.recommendations.showRealTimeData')}</li>
                        {rec.priority === 'high' && <li>{t('dashboard.recommendations.addressCriticalIssues')}</li>}
                      </ul>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus className="w-3 h-3" />}
                        loading={isAdding}
                        onClick={() => handleAddCard(rec)}
                        className="flex-1"
                      >
                        {isAdding ? t('dashboard.recommendations.adding') : t('buttons.addCard')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Clock className="w-3 h-3" />}
                        onClick={(e) => handleSnooze(e, rec)}
                        title={t('dashboard.recommendations.snooze')}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<X className="w-3 h-3" />}
                        onClick={(e) => handleDismiss(e, rec)}
                        title={t('dashboard.recommendations.dismiss')}
                      />
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
