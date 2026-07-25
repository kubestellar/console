import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CardWrapper } from '../cards/CardWrapper'
import { useCardCollapse } from '../../lib/cards/cardHooks'
import type { Card } from './dashboardUtils'

interface SortableCardProps {card: Card; onRemove?: (cardId: string) => void; onConfigure?: (card: Card) => void}

export function SortableCard({card, onRemove, onConfigure}: SortableCardProps) {
  const {t} = useTranslation()
  const [isHovering, setIsHovering] = useState(false)
  const {isCollapsed, toggleCollapse} = useCardCollapse(card.id)
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id: card.id})
  const style = {transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1}
  const minWidth = 'min(100%, 280px)'

  return (<div ref={setNodeRef} style={style} className="relative" onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>
    {isHovering && (<div className="absolute top-2 left-2 z-10 flex gap-2"><button {...attributes} {...listeners} className="p-1.5 rounded bg-card/80 hover:bg-primary/20 transition-colors cursor-grab active:cursor-grabbing" title={t('common.dragToReorder')}><GripVertical className="w-4 h-4" /></button>
      {onConfigure && (<button onClick={() => onConfigure(card)} className="px-2 py-1.5 rounded bg-card/80 hover:bg-primary/20 transition-colors text-xs">{t('common.configure')}</button>)}
      {onRemove && (<button onClick={() => onRemove(card.id)} className="px-2 py-1.5 rounded bg-card/80 hover:bg-destructive/20 transition-colors text-xs">{t('common.remove')}</button>)}</div>)}
    <CardWrapper card={card} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} style={{minWidth}} />
  </div>)
}
