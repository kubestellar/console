import { RotateCcw } from 'lucide-react'
import { SUIT_CONFIG, CARD_SIZES, type PlayingCard, type CardSize } from './solitaire.constants'

export function SolitaireCard({
  card,
  onClick,
  onDoubleClick,
  isDragging,
  isSelected,
  size = 'medium',
}: {
  card: PlayingCard | null
  onClick?: () => void
  onDoubleClick?: () => void
  isDragging?: boolean
  isSelected?: boolean
  size?: CardSize
}) {
  const { w, h, text, icon, centerIcon } = CARD_SIZES[size]

  if (!card) {
    return (
      <div
        style={{ width: w, height: h }}
        className="rounded border-2 border-dashed border-border/30 bg-secondary/20"
        onClick={onClick}
      />
    )
  }

  const { Icon, color } = SUIT_CONFIG[card.suit]

  if (!card.faceUp) {
    return (
      <div
        onClick={onClick}
        style={{ width: w, height: h }}
        className="rounded border border-border bg-linear-to-br from-blue-600 to-purple-700 cursor-pointer hover:brightness-110 transition-all shadow-xs flex items-center justify-center"
      >
        <div className={`${size === 'small' ? 'w-4 h-4' : size === 'medium' ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-muted/20 flex items-center justify-center`}>
          <span className={`text-foreground/50 font-bold ${size === 'small' ? 'text-[6px]' : size === 'medium' ? 'text-xs' : 'text-sm'}`}>K8s</span>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ width: w, height: h }}
      className={`${text} rounded border bg-card cursor-pointer hover:brightness-110 transition-all shadow-xs p-0.5 flex flex-col justify-between ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-background' : 'border-border'
      }`}
    >
      <div className={`flex items-center gap-0.5 ${color}`}>
        <span className="font-bold">{card.value}</span>
        <Icon className={icon} />
      </div>
      <div className={`flex items-center justify-center ${color}`}>
        <Icon className={centerIcon} />
      </div>
      <div className={`flex items-center gap-0.5 justify-end rotate-180 ${color}`}>
        <span className="font-bold">{card.value}</span>
        <Icon className={icon} />
      </div>
    </div>
  )
}

export function StockPile({
  cards,
  onClick,
  size = 'medium',
}: {
  cards: PlayingCard[]
  onClick: () => void
  size?: CardSize
}) {
  const { w, h } = CARD_SIZES[size]

  if (cards.length === 0) {
    return (
      <div
        onClick={onClick}
        style={{ width: w, height: h }}
        className="rounded border-2 border-dashed border-green-500/50 bg-green-500/10 cursor-pointer hover:bg-green-500/20 transition-colors flex items-center justify-center"
        title="Click to reset stock"
      >
        <RotateCcw className={`${size === 'small' ? 'w-3 h-3' : size === 'medium' ? 'w-4 h-4' : 'w-5 h-5'} text-green-400`} />
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className="cursor-pointer"
      title="Click to draw"
      aria-label="Click to draw"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      <SolitaireCard card={{ ...cards[0], faceUp: false }} size={size} />
    </div>
  )
}
