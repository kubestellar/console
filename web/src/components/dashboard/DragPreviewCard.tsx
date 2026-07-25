import { CARD_COMPONENTS } from '../cards/cardRegistry'
import { CardWrapper } from '../cards/CardWrapper'
import { formatCardTitle } from '../../lib/formatCardTitle'
import type { Card } from './dashboardUtils'

interface DragPreviewCardProps {card: Card}

export function DragPreviewCard({card}: DragPreviewCardProps) {
  return (<div className="w-80 pointer-events-none opacity-90 shadow-xl"><CardWrapper card={card} /><div className="mt-1 text-xs text-muted-foreground text-center">{formatCardTitle(card.name)}</div></div>)
}
