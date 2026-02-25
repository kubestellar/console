import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, ChevronDown, X, Plus, AlertTriangle, Info, Lightbulb } from 'lucide-react'
import { useCardRecommendations, CardRecommendation } from '../../hooks/useCardRecommendations'
import { useSnoozedRecommendations } from '../../hooks/useSnoozedRecommendations'

interface Props {
  currentCardTypes: string[]
  onAddCard: (cardType: string, config?: Record<string, unknown>) => void
}

const PRIORITY_STYLES = {
  high: {
    bg: 'bg-red-500/20',
    border: 'border-red-500/30',
    text: 'text-red-400',
  },
  medium: {
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
  },
  low: {
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
  },
}

export function CardRecommendations({ currentCardTypes, onAddCard }: Props) {
  const { t } = useTranslation()
  const { recommendations, hasRecommendations, highPriorityCount } = useCardRecommendations(currentCardTypes)
  // Subscribe to snoozedRecommendations to trigger re-render when snooze state changes
  const { snoozeRecommendation, dismissRecommendation, isSnoozed, isDismissed, snoozedRecommendations } = useSnoozedRecommendations()
  const [expandedRec, setExpandedRec] = useState<string | null>(null)
  const [addingCard, setAddingCard] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Force dependency on snoozedRecommendations for reactivity
  void snoozedRecommendations

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!expandedRec) return

    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside the dropdown content
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExpandedRec(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedRec(null)
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
  }, [expandedRec])

  const handleAddCard = async (rec: CardRecommendation) => {
    setAddingCard(rec.id)
    await new Promise(resolve => setTimeout(resolve, 300))
    onAddCard(rec.cardType, rec.config)
    setAddingCard(null)
    setExpandedRec(null)
    dismissRecommendation(rec.id) // Permanently hide tile after adding card
  }

  const handleSnooze = (e: React.MouseEvent, rec: CardRecommendation) => {
    e.stopPropagation()
    snoozeRecommendation(rec)
    setExpandedRec(null)
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedRec(null)
  }

  // Filter out snoozed and dismissed recommendations
  const visibleRecommendations = recommendations.filter(rec => !isSnoozed(rec.id) && !isDismissed(rec.id))

  if (!hasRecommendations || visibleRecommendations.length === 0) return null

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return AlertTriangle
      case 'medium': return Info
      default: return Lightbulb
    }
  }

  return (
    <div data-tour="recommendations" className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
          <Lightbulb className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">{t('dashboard.recommendations.ai')}</span>
        </div>

        {/* Inline recommendation chips */}
        {visibleRecommendations.slice(0, 6).map((rec) => {
          const style = PRIORITY_STYLES[rec.priority as keyof typeof PRIORITY_STYLES] || PRIORITY_STYLES.low
          const isExpanded = expandedRec === rec.id
          const isAdding = addingCard === rec.id
          const Icon = getPriorityIcon(rec.priority)

          return (
            <div key={rec.id} className="relative">
              {/* Compact chip */}
              <button
                onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all hover:scale-105 ${style.border} ${style.bg} ${style.text}`}
              >
                <Icon className="w-3 h-3" />
                <span className="max-w-[150px] truncate">{rec.title}</span>
                {rec.priority === 'high' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {isAdding && <div className="spinner w-3 h-3" />}
                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded dropdown */}
              {isExpanded && (
                <div
                  ref={dropdownRef}
                  role="menu"
                  className={`absolute top-full left-0 mt-1 z-50 w-72 rounded-lg border ${style.border} ${style.bg} backdrop-blur-sm shadow-xl`}
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
                      <button
                        onClick={() => handleAddCard(rec)}
                        disabled={isAdding}
                        className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                          rec.priority === 'high'
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : rec.priority === 'medium'
                            ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        } disabled:opacity-50`}
                      >
                        <Plus className="w-3 h-3" />
                        {isAdding ? t('dashboard.recommendations.adding') : t('buttons.addCard')}
                      </button>
                      <button
                        onClick={(e) => handleSnooze(e, rec)}
                        className="px-2 py-1.5 rounded text-xs font-medium bg-secondary/50 hover:bg-secondary transition-colors"
                        title={t('dashboard.recommendations.snooze')}
                      >
                        <Clock className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleDismiss}
                        className="px-2 py-1.5 rounded text-xs font-medium bg-secondary/50 hover:bg-secondary transition-colors"
                        title={t('dashboard.recommendations.dismiss')}
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
        {highPriorityCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px]">
            {t('dashboard.recommendations.critical', { count: highPriorityCount })}
          </span>
        )}

        {visibleRecommendations.length > 6 && (
          <span className="text-[10px] text-muted-foreground">
            {t('dashboard.recommendations.more', { count: visibleRecommendations.length - 6 })}
          </span>
        )}
      </div>
    </div>
  )
}
