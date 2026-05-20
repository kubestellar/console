import { useTranslation } from 'react-i18next'
import { Clock, X, Wrench, Stethoscope } from 'lucide-react'
import type { MissionSuggestion } from '../../hooks/useMissionSuggestions'
import { formatTimeRemaining } from '../../hooks/useSnoozedMissions'
import type { CSSProperties } from 'react'

// Inline style constants
const MISSION_ACTION_PANEL_STYLE: CSSProperties = { isolation: 'isolate' }

interface MissionActionPanelProps {
  suggestion: MissionSuggestion
  isExpanded: boolean
  isProcessing: boolean
  snoozeRemaining: number | null
  onAction: (e: React.MouseEvent, suggestion: MissionSuggestion) => void
  onRepair: (e: React.MouseEvent, suggestion: MissionSuggestion) => void
  onSnooze: (e: React.MouseEvent, suggestion: MissionSuggestion) => void
  onDismiss: (e: React.MouseEvent, suggestion: MissionSuggestion) => void
}

/**
 * Dropdown action panel for a mission suggestion chip.
 * Displays description, context details, and action buttons (investigate, repair, snooze, dismiss).
 */
export function MissionActionPanel({
  suggestion,
  isExpanded,
  isProcessing,
  snoozeRemaining,
  onAction,
  onRepair,
  onSnooze,
  onDismiss,
}: MissionActionPanelProps) {
  const { t } = useTranslation()

  if (!isExpanded) return null

  return (
    <div
      id={`mission-dropdown-${suggestion.id}`}
      role="menu"
      className="absolute top-full left-0 mt-1 z-dropdown w-72 rounded-lg border border-border/50 bg-card shadow-xl"
      style={MISSION_ACTION_PANEL_STYLE}
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
            onClick={(e) => onAction(e, suggestion)}
            disabled={isProcessing}
            className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 bg-primary hover:bg-primary/80 text-white disabled:opacity-50"
          >
            <Stethoscope className="w-3 h-3" />
            {suggestion.action.label}
          </button>
          <button
            onClick={(e) => onRepair(e, suggestion)}
            disabled={isProcessing}
            className="px-2 py-1.5 rounded text-xs font-medium bg-secondary/50 hover:bg-secondary text-foreground transition-colors flex items-center gap-1"
            title={t('dashboard.missions.repairTitle')}
          >
            <Wrench className="w-3 h-3" />
            {t('dashboard.missions.repair')}
          </button>
          <button
            onClick={(e) => onSnooze(e, suggestion)}
            disabled={isProcessing}
            className="px-2 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
            title={t('dashboard.missions.snoozeTitle')}
          >
            <Clock className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => onDismiss(e, suggestion)}
            disabled={isProcessing}
            className="px-2 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
            title={t('dashboard.missions.dismiss')}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
