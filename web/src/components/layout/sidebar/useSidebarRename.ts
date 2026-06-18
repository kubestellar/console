import { useState } from 'react'
import { emitDashboardRenamed } from '../../../lib/analytics'
import type { SidebarNavItem } from './types'

interface UseSidebarRenameProps {
  onUpdateItem: (id: string, updates: { name: string }) => void
  onEditingChange?: (itemId: string | null) => void
}

export function useSidebarRename({ onUpdateItem, onEditingChange }: UseSidebarRenameProps) {
  const [editingItemId, setEditingItemIdState] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const setEditingItemId = (itemId: string | null) => {
    setEditingItemIdState(itemId)
    onEditingChange?.(itemId)
  }

  const handleDoubleClick = (item: SidebarNavItem, event: React.MouseEvent) => {
    if (!item.isCustom || !item.href.startsWith('/custom-dashboard/')) return
    event.preventDefault()
    event.stopPropagation()
    setEditingItemId(item.id)
    setEditingName(item.label)
  }

  const handleSaveRename = (itemId: string) => {
    const trimmed = editingName.trim()
    if (trimmed) {
      onUpdateItem(itemId, { name: trimmed })
      emitDashboardRenamed()
    }
    setEditingItemId(null)
    setEditingName('')
  }

  return {
    editingItemId,
    editingName,
    setEditingItemId,
    setEditingName,
    handleDoubleClick,
    handleSaveRename,
  }
}
