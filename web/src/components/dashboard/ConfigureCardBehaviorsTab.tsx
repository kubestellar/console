import type { TFunction } from 'i18next'
import { cn } from '../../lib/cn'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'
import type { CardBehavior } from './cardConfigData'

interface ConfigureCardBehaviorsTabProps {
  cardBehaviors: CardBehavior[]
  behaviors: Record<string, boolean>
  t: TFunction
  toggleBehavior: (key: string) => void
}

export function ConfigureCardBehaviorsTab({
  cardBehaviors,
  behaviors,
  t,
  toggleBehavior,
}: ConfigureCardBehaviorsTabProps) {
  if (cardBehaviors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {t('dashboard.configure.noBehaviors')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {cardBehaviors.map((behavior) => (
        <div
          key={behavior.key}
          className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
          onClick={() => toggleBehavior(behavior.key)}
        >
          <div className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
            behaviors[behavior.key]
              ? 'bg-purple-500 border-purple-500'
              : 'border-border',
          )}>
            {behaviors[behavior.key] && (
              <svg className="w-3 h-3 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{t(`cardConfig.behaviorLabels.${behavior.key}`, behavior.label)}</p>
            <p className="text-xs text-muted-foreground">{wrapAbbreviations(behavior.description)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
