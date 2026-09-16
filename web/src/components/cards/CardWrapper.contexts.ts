import { createContext, use } from 'react'
import type { CardExpandedContextType } from './CardWrapper.types'

// Context to expose card expanded state to children
export const CardExpandedContext = createContext<CardExpandedContextType>({
  isExpanded: false,
  containerSize: { width: 0, height: 0 } })

/** Hook for child components to know if their parent card is expanded and get container size */
export function useCardExpanded() {
  return use(CardExpandedContext)
}

// Context to expose cardType to descendant shared components (CardControls,
// CardSearchInput, CardClusterFilter) so GA4 events can identify which card
// the user interacted with — no prop threading required.
export const CardTypeContext = createContext<string>('')

/** Hook for shared UI components to read the cardType of their parent CardWrapper */
export function useCardType() {
  return use(CardTypeContext)
}
