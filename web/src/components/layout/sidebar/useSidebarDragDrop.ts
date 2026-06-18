import { useRef, useState, type DragEvent } from 'react'
import type { SidebarNavItem } from './types'

interface UseSidebarDragDropProps {
  primaryNav: SidebarNavItem[]
  secondaryNav: SidebarNavItem[]
  onReorderItems: (items: SidebarNavItem[], section: 'primary' | 'secondary') => void
}

export function useSidebarDragDrop({
  primaryNav,
  secondaryNav,
  onReorderItems,
}: UseSidebarDragDropProps) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const dragCounter = useRef(0)

  const handleDragStart = (event: DragEvent, itemId: string, sectionId: string) => {
    setDraggedItem(itemId)
    setDragSection(sectionId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemId)
    requestAnimationFrame(() => {
      const target = event.target as HTMLElement
      target.style.opacity = '0.5'
    })
  }

  const handleDragEnd = (event: DragEvent) => {
    const target = event.target as HTMLElement
    target.style.opacity = '1'
    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
    dragCounter.current = 0
  }

  const handleDragEnter = (event: DragEvent, itemId: string) => {
    event.preventDefault()
    dragCounter.current += 1
    if (itemId !== draggedItem) {
      setDragOverItem(itemId)
    }
  }

  const handleDragLeave = () => {
    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setDragOverItem(null)
    }
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event: DragEvent, targetId: string, sectionId: string) => {
    event.preventDefault()
    dragCounter.current = 0

    if (!draggedItem || draggedItem === targetId || sectionId !== dragSection) {
      setDraggedItem(null)
      setDragOverItem(null)
      setDragSection(null)
      return
    }

    const section = sectionId as 'primary' | 'secondary'
    const items = section === 'primary' ? [...primaryNav] : [...secondaryNav]
    const draggedIndex = items.findIndex(item => item.id === draggedItem)
    const targetIndex = items.findIndex(item => item.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      return
    }

    const [removed] = items.splice(draggedIndex, 1)
    items.splice(targetIndex, 0, removed)

    onReorderItems(items.map((item, index) => ({ ...item, order: index })), section)
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
