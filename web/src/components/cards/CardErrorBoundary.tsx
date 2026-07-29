import type { ReactNode, RefObject } from 'react'
import { CardErrorFallback } from './CardErrorFallback'

interface CardErrorBoundaryProps {
  containerRef: RefObject<HTMLDivElement | null>
  cardId: string
  children: ReactNode
}

export function CardErrorBoundary({ containerRef, cardId, children }: CardErrorBoundaryProps) {
  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 flex-col">
      <CardErrorFallback cardId={cardId}>
        {children}
      </CardErrorFallback>
    </div>
  )
}
