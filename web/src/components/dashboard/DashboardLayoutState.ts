/**
 * DashboardLayoutState.ts — Layout state management for dashboard.
 * Extracted from DashboardState.ts per issue #19014.
 * Manages grid layout, drag-and-drop sensors, and keyboard navigation.
 */
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCardGridNavigation } from '../../hooks/useCardGridNavigation'
import type { Card } from './dashboardUtils'

interface UseDashboardLayoutStateProps {
  localCards: Card[]
  handleExpandCard: (cardId: string) => void
}

export function useDashboardLayoutState({
  localCards,
  handleExpandCard,
}: UseDashboardLayoutStateProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const { registerCardRef, handleGridKeyDown } = useCardGridNavigation({
    cards: localCards,
    onExpandCard: handleExpandCard,
  })

  return {
    sensors,
    registerCardRef,
    handleGridKeyDown,
  }
}
