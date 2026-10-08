import { AlertCircle, CheckCircle, MinusCircle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'
import type { IntotoLayout, IntotoStep } from '../../../hooks/useIntoto'

/** Icon and colour for each step verification status */
const STEP_STATUS_CONFIG: Record<
  IntotoStep['status'],
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  verified: { icon: CheckCircle, color: 'text-green-400', label: 'Verified' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Failed' },
  missing: { icon: MinusCircle, color: 'text-yellow-400', label: 'Missing' },
  unknown: { icon: AlertCircle, color: 'text-muted-foreground', label: 'Unknown' },
}

function getLayoutHealthColor(layout: IntotoLayout) {
  if (layout.failedSteps > 0) return 'yellow'
  if (layout.verifiedSteps === layout.steps.length && layout.steps.length > 0) return 'green'
  return 'blue'
}

interface IntotoLayoutRowProps {
  layout: IntotoLayout
  isExpanded: boolean
  onToggle: () => void
}

export function IntotoLayoutRow({ layout, isExpanded, onToggle }: IntotoLayoutRowProps) {
  const { t } = useTranslation(['cards', 'common'])
  const healthColor = getLayoutHealthColor(layout)

  return (
    <div
      className="rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
    >
      {/* Layout header row */}
      <button
        className="w-full p-2.5 text-left"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} layout: ${layout.name} on ${layout.cluster}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
          <span className="text-sm font-medium text-foreground truncate">
            {layout.name}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {layout.failedSteps > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <XCircle className="w-3 h-3" />
                {layout.failedSteps}
              </span>
            )}
            <StatusBadge color={healthColor} size="xs">
              {layout.verifiedSteps}/{layout.steps.length}
            </StatusBadge>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
          <span>{t('intoto_supply_chain.stepsCount', { count: layout.steps.length })}</span>
          <span className="text-2xs">{layout.cluster}</span>
        </div>
      </button>

      {/* Expanded steps */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 space-y-1 border-t border-border/30 pt-2">
          {(layout.steps || []).map((step, si) => {
            const cfg = STEP_STATUS_CONFIG[step.status]
            const StatusIcon = cfg.icon
            return (
              <div
                key={`${step.name}-${si}`}
                className="flex flex-wrap items-center justify-between gap-y-2 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <StatusIcon className={`w-3 h-3 ${cfg.color} shrink-0`} />
                  <span className="text-foreground">{step.name}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-2xs">{step.functionary}</span>
                  <span className={`text-2xs ${cfg.color}`}>{cfg.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
