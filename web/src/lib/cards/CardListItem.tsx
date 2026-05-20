import { type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { useCardType } from '../../components/cards/CardWrapper'
import { emitCardListItemClicked } from '../analytics'

export interface CardListItemProps {
  onClick?: () => void
  /** Background color variant */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  /** Custom background class */
  bgClass?: string
  /** Custom border class */
  borderClass?: string
  /** Show chevron on hover */
  showChevron?: boolean
  /** Children content */
  children: ReactNode
  /** Tooltip */
  title?: string
  /** Data attribute for tour */
  dataTour?: string
}

const listItemVariants = {
  default: { bg: 'bg-secondary/30', border: 'border-border/50' },
  success: { bg: 'bg-green-500/20', border: 'border-green-500/20' },
  warning: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/20' },
  error: { bg: 'bg-red-500/20', border: 'border-red-500/20' },
  info: { bg: 'bg-blue-500/20', border: 'border-blue-500/20' } }

export function CardListItem({
  onClick,
  variant = 'default',
  bgClass,
  borderClass,
  showChevron = true,
  children,
  title,
  dataTour }: CardListItemProps) {
  const cardType = useCardType()
  const variantConfig = listItemVariants[variant]
  const bg = bgClass || variantConfig.bg
  const border = borderClass || variantConfig.border

  const handleClick = onClick ? () => {
    emitCardListItemClicked(cardType)
    onClick()
  } : undefined

  return (
    <div
      data-tour={dataTour}
      className={`p-3 rounded-lg ${bg} border ${border} ${handleClick ? 'cursor-pointer hover:opacity-80' : ''
        } transition-all group`}
      onClick={handleClick}
      {...(handleClick ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } } } : {})}
      title={title}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">{children}</div>
        {showChevron && onClick && (
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-center" />
        )}
      </div>
    </div>
  )
}
