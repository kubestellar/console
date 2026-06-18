import { useEffect, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { useModalFocusTrap } from '../../../lib/modals'

interface UseSidebarEffectsProps {
  isMobile: boolean
  isMobileSidebarOpen: boolean
  sidebarRef: RefObject<HTMLElement | null>
  editingItemId: string | null
  isTopEscapeLayer: () => boolean
  onCloseMobileSidebar: () => void
}

export function useSidebarEffects({
  isMobile,
  isMobileSidebarOpen,
  sidebarRef,
  editingItemId,
  isTopEscapeLayer,
  onCloseMobileSidebar,
}: UseSidebarEffectsProps) {
  const location = useLocation()

  useEffect(() => {
    if (isMobile) {
      onCloseMobileSidebar()
    }
  }, [location.pathname, isMobile, onCloseMobileSidebar])

  useEffect(() => {
    if (isMobileSidebarOpen && sidebarRef.current) {
      sidebarRef.current.scrollTop = 0
    }
  }, [isMobileSidebarOpen, sidebarRef])

  useModalFocusTrap(sidebarRef, isMobileSidebarOpen)

  useEffect(() => {
    if (!isMobileSidebarOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopEscapeLayer() || editingItemId !== null) return
      event.preventDefault()
      event.stopPropagation()
      onCloseMobileSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingItemId, isMobileSidebarOpen, isTopEscapeLayer, onCloseMobileSidebar])
}
