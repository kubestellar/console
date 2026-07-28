import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

interface PanelSectionProps {
  title: string
  children: ReactNode
  className?: string
  titleClassName?: string
}

export function PanelSection({
  title,
  children,
  className,
  titleClassName = 'text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5',
}: PanelSectionProps) {
  return (
    <div className={className}>
      <h4 className={titleClassName}>{title}</h4>
      {children}
    </div>
  )
}

interface PanelDividerProps {
  children: ReactNode
  className?: string
}

export function PanelDivider({ children, className }: PanelDividerProps) {
  return <div className={cn('pt-2 border-t border-border', className)}>{children}</div>
}
