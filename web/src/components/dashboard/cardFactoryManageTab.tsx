import { useTranslation } from 'react-i18next'
import { Wand2, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { DynamicCardDefinition } from '../../lib/dynamic-cards/types'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'

interface ManageCardsTabProps {
  /** All dynamic cards currently saved by the user. */
  existingCards: DynamicCardDefinition[]
  /**
   * Called with a card id when the user clicks the delete (trash) icon.
   * The parent is responsible for surfacing a confirmation dialog and
   * performing the actual deletion.
   */
  onDeleteRequest: (id: string) => void
}

/**
 * "Manage" tab content for the Card Factory modal.
 *
 * Renders an empty-state when no custom cards exist, or a list of saved
 * dynamic cards (with title, tier badge, description, id/createdAt metadata,
 * and a delete affordance).
 *
 * Pure presentation: no internal state, no side effects. Extracted from
 * `CardFactoryModal.tsx` (issue #8608, part 7) so the modal stays focused
 * on its role as a tab host.
 */
export function ManageCardsTab({ existingCards, onDeleteRequest }: ManageCardsTabProps) {
  const { t } = useTranslation()

  if (existingCards.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Wand2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">{t('dashboard.cardFactory.noCustomCards')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('dashboard.cardFactory.useDeclarativeOrCode')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {existingCards.map(card => (
        <div key={card.id} className="rounded-lg bg-card/50 border border-border p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{wrapAbbreviations(card.title)}</span>
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                card.tier === 'tier1' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400',
              )}>
                {card.tier === 'tier1' ? t('dashboard.cardFactory.declarativeBadge') : t('dashboard.cardFactory.customCodeBadge')}
              </span>
            </div>
            {card.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{wrapAbbreviations(card.description)}</p>
            )}
            <p className="text-xs text-muted-foreground/70 mt-1">
              ID: {card.id} · Created: {new Date(card.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => onDeleteRequest(card.id)}
            className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
            title={t('dashboard.cardFactory.deleteCard')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
