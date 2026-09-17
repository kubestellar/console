import { useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent } from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Card } from './types'

/**
 * Drag-and-drop state and handlers for the dashboard card grid.
 *
 * Extracted from CustomDashboard.tsx to isolate @dnd-kit wiring from the
 * rest of the dashboard's state management.
 */
export function useDashboardDragDrop(
  cardsRef: MutableRefObject<Card[]>,
  setCards: Dispatch<SetStateAction<Card[]>>,
  snapshot: (current: Card[]) => void,
) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      snapshot(cardsRef.current)
      setCards(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id)
        const newIndex = prev.findIndex(c => c.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  return { activeId, sensors, collisionDetection: closestCenter, handleDragStart, handleDragEnd }
}
