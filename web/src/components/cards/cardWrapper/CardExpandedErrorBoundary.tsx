import type { ReactNode } from 'react'
import { CardErrorFallback } from '../CardErrorFallback'

interface CardExpandedErrorBoundaryProps {
  cardId: string
  children: ReactNode
}

export function CardExpandedErrorBoundary({ cardId, children }: CardExpandedErrorBoundaryProps) {
  return (
    <CardErrorFallback cardId={cardId}>
      {children}
    </CardErrorFallback>
  )
}
