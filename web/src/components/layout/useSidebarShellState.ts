import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  useSidebarConfig,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_DEFAULT_WIDTH_PX,
} from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useClusters } from '../../hooks/mcp/clusters'
import { isClusterHealthy, isClusterUnreachable } from '../clusters/utils'
import { useActiveUsers } from '../../hooks/useActiveUsers'
import { useMissions } from '../../hooks/useMissions'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpgradeState } from '../../hooks/useUpgradeState'
import { useEscapeLayer, useModalFocusTrap } from '../../lib/modals'
import { ROUTES } from '../../config/routes'
import { useSidebarCollapseLogic } from './SidebarCollapseLogic'

const SIDEBAR_MIN_WIDTH_PX = 180
const SIDEBAR_MAX_WIDTH_PX = 480
const SIDEBAR_RESIZE_STEP_PX = 16

export function useSidebarShellState(widthOverride?: number) {
  const { config, toggleCollapsed, setCollapsed, reorderItems, updateItem, removeItem, closeMobileSidebar, setWidth } = useSidebarConfig()
  const { isMobile } = useMobile()
  const { deduplicatedClusters } = useClusters()
  const { isFullScreen: isMissionFullScreen } = useMissions()
  const { viewerCount, hasError: viewersError, isLoading: viewersLoading } = useActiveUsers()
  const { hasUpdate, channel, latestMainSHA } = useVersionCheck()
  const upgradeState = useUpgradeState()
  const isUpgrading = upgradeState.phase === 'triggering' || upgradeState.phase === 'restarting'
  const navigate = useNavigate()
  const location = useLocation()
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const isMobileSidebarOpen = isMobile && config.isMobileOpen
  const isTopEscapeLayer = useEscapeLayer(isMobileSidebarOpen)

  useEffect(() => {
    if (isMobile) {
      closeMobileSidebar()
    }
  }, [closeMobileSidebar, isMobile, location.pathname])

  useEffect(() => {
    if (isMobileSidebarOpen && sidebarRef.current) {
      sidebarRef.current.scrollTop = 0
    }
  }, [isMobileSidebarOpen])

  useModalFocusTrap(sidebarRef, isMobileSidebarOpen)

  useEffect(() => {
    if (!isMobileSidebarOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopEscapeLayer() || editingItemId !== null) return
      event.preventDefault()
      event.stopPropagation()
      closeMobileSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeMobileSidebar, editingItemId, isMobileSidebarOpen, isTopEscapeLayer])

  const isCollapsed = !isMobile && config.collapsed
  const sidebarWidth = isCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH_PX
    : (widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  const {
    isPinned,
    handleSidebarMouseEnter,
    handleSidebarMouseLeave,
    toggleSidebarPin,
    handleCollapseToggle,
  } = useSidebarCollapseLogic({
    collapsed: config.collapsed,
    isMobile,
    setCollapsed,
    toggleCollapsed,
  })

  const clampSidebarWidth = useCallback((nextWidth: number) => {
    return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, nextWidth))
  }, [])

  useEffect(() => {
    return () => resizeCleanupRef.current?.()
  }, [])

  const handleResizeStart = (event: React.MouseEvent) => {
    event.preventDefault()
    setIsResizing(true)
    const startX = event.clientX
    const startWidth = widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizeCleanupRef.current = null
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    resizeCleanupRef.current = handleMouseUp
  }

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0
    if (event.key === 'ArrowLeft') delta = -SIDEBAR_RESIZE_STEP_PX
    else if (event.key === 'ArrowRight') delta = SIDEBAR_RESIZE_STEP_PX
    if (delta === 0) return
    event.preventDefault()
    setWidth(clampSidebarWidth(sidebarWidth + delta))
  }

  const handleClusterStatusClick = (status: 'healthy' | 'unhealthy' | 'unreachable') => {
    navigate(`${ROUTES.CLUSTERS}?status=${status}`)
  }

  const unreachableClusters = deduplicatedClusters.filter((cluster) => isClusterUnreachable(cluster)).length
  const healthyClusters = deduplicatedClusters.filter((cluster) => !isClusterUnreachable(cluster) && isClusterHealthy(cluster)).length
  const unhealthyClusters = deduplicatedClusters.length - healthyClusters - unreachableClusters

  const handleMobileBackdropClose = () => {
    if (editingItemId !== null) return
    closeMobileSidebar()
  }

  return {
    config,
    reorderItems,
    updateItem,
    removeItem,
    isMobile,
    isMissionFullScreen,
    viewerCount,
    viewersError,
    viewersLoading,
    hasUpdate,
    channel,
    latestMainSHA,
    isUpgrading,
    editingItemId,
    setEditingItemId,
    editingName,
    setEditingName,
    isResizing,
    sidebarRef,
    isMobileSidebarOpen,
    isCollapsed,
    sidebarWidth,
    isPinned,
    handleSidebarMouseEnter,
    handleSidebarMouseLeave,
    toggleSidebarPin,
    handleCollapseToggle,
    handleResizeStart,
    handleResizeKeyDown,
    handleClusterStatusClick,
    clusterCount: deduplicatedClusters.length,
    healthyClusters,
    unhealthyClusters,
    unreachableClusters,
    handleMobileBackdropClose,
    sidebarMinWidth: SIDEBAR_MIN_WIDTH_PX,
    sidebarMaxWidth: SIDEBAR_MAX_WIDTH_PX,
  }
}
