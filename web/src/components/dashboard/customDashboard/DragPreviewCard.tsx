import { CardWrapper } from '../../cards/CardWrapper'
import { CARD_COMPONENTS } from '../../cards/cardRegistry'
import { formatCardTitle } from '../../../lib/formatCardTitle'
import type { Card } from './types'

export function DragPreviewCard({ card }: { card: Card }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div
      className="rounded-lg border border-purple-500 bg-card shadow-lg"
      style={{ width: `${(card.position?.w || 4) * 80}px`, height: '200px' }}
    >
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={card.title || formatCardTitle(card.card_type)}
        cardWidth={card.position?.w || 4}
      >
        {CardComponent ? <CardComponent config={card.config ?? {}} /> : null}
      </CardWrapper>
    </div>
  )
}
