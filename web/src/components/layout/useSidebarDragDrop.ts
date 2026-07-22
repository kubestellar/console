import { useState, useRef } from 'react'

export interface SidebarDragDropItem {
  id: string
}

export type SidebarDragDropSection = 'primary' | 'secondary'

export interface UseSidebarDragDropResult {
  /** ID of the item currently being dragged, or null */
  draggedItem: string | null
  /** ID of the item currently being dragged over, or null */
  dragOverItem: string | null
  /** Section that owns the dragged item, or null */
  dragSection: string | null
  handleDragStart: (e: React.DragEvent, itemId: string, sectionId: string) => void
  handleDragEnd: (e: React.DragEvent) => void
  handleDragEnter: (e: React.DragEvent, itemId: string) => void
  handleDragLeave: () => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (
    e: React.DragEvent,
    targetId: string,
    sectionId: SidebarDragDropSection,
    getItems: (section: SidebarDragDropSection) => SidebarDragDropItem[],
    onReorder: (items: SidebarDragDropItem[], section: SidebarDragDropSection) => void,
  ) => void
}

/**
 * Manages all drag-and-drop state and handlers for sidebar nav item reordering.
 *
 * The caller is responsible for providing `getItems` and `onReorder` at drop
 * time (via the `handleDrop` parameters) so the hook itself has no dependency
 * on sidebar config state.
 */
export function useSidebarDragDrop(): UseSidebarDragDropResult {
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const dragCounter = useRef(0)

  const handleDragStart = (e: React.DragEvent, itemId: string, sectionId: string) => {
    setDraggedItem(itemId)
    setDragSection(sectionId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
    requestAnimationFrame(() => {
      const target = e.target as HTMLElement
      target.style.opacity = '0.5'
    })
  }

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement
    target.style.opacity = '1'
    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
    dragCounter.current = 0
  }

  const handleDragEnter = (e: React.DragEvent, itemId: string) => {
    e.preventDefault()
    dragCounter.current++
    if (itemId !== draggedItem) {
      setDragOverItem(itemId)
    }
  }

  const handleDragLeave = () => {
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragOverItem(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (
    e: React.DragEvent,
    targetId: string,
    sectionId: SidebarDragDropSection,
    getItems: (section: SidebarDragDropSection) => SidebarDragDropItem[],
    onReorder: (items: SidebarDragDropItem[], section: SidebarDragDropSection) => void,
  ) => {
    e.preventDefault()
    dragCounter.current = 0

    if (!draggedItem || draggedItem === targetId || sectionId !== dragSection) {
      setDraggedItem(null)
      setDragOverItem(null)
      setDragSection(null)
      return
    }

    const items = [...getItems(sectionId)]
    const draggedIndex = items.findIndex(item => item.id === draggedItem)
    const targetIndex = items.findIndex(item => item.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const [removed] = items.splice(draggedIndex, 1)
    items.splice(targetIndex, 0, removed)

    onReorder(items, sectionId)

    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
  }

  return {
    draggedItem,
    dragOverItem,
    dragSection,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  }
}
