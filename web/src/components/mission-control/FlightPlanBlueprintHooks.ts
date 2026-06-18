/**
 * FlightPlanBlueprintHooks — Custom hooks for FlightPlanBlueprint state management
 *
 * Extracted from FlightPlanBlueprint.tsx (#18875)
 */

import { useState, useMemo, useRef, type RefObject } from 'react'
import { useClusters } from '../../hooks/mcp/clusters'
import { computeLayout } from './BlueprintLayout'
import type { MissionControlState } from './types'
import { INFO_PANEL_MIN, INFO_PANEL_MAX, INFO_PANEL_DEFAULT, INFO_PANEL_LS_KEY } from './FlightPlanBlueprintConstants'

/**
 * Manages healthy cluster filtering and project reassignment
 */
export function useHealthyState(state: MissionControlState) {
  const { deduplicatedClusters: clusters } = useClusters()

  return useMemo(() => {
    const targetSet = new Set(state.targetClusters || [])
    let assignments = targetSet.size === 0
      ? state.assignments
      : state.assignments.filter(a => targetSet.has(a.clusterName))
    
    // Only build the unhealthy set from clusters that are explicitly marked unhealthy/unreachable
    const unhealthyNames = clusters?.length
      ? new Set(clusters.filter(c => c.healthy === false || c.reachable === false).map(c => c.name))
      : new Set<string>()

    const hasUnhealthy = assignments.some(a => a.projectNames.length > 0 && unhealthyNames.has(a.clusterName))
    if (hasUnhealthy) {
      const orphanedProjects: string[] = []
      const healthyAssignments = assignments.filter(a => {
        if (!unhealthyNames.has(a.clusterName)) return true
        orphanedProjects.push(...a.projectNames)
        return false
      }).map(a => ({ ...a, projectNames: [...a.projectNames] }))
      
      if (orphanedProjects.length > 0 && healthyAssignments.length > 0) {
        orphanedProjects.forEach((p, i) => {
          const target = healthyAssignments[i % healthyAssignments.length]
          if (!target.projectNames.includes(p)) {
            target.projectNames.push(p)
          }
        })
      }
      assignments = healthyAssignments
    }

    return { ...state, assignments }
  }, [state, clusters])
}

/**
 * Manages memoized layout computation
 */
export function useLayout(healthyState: MissionControlState) {
  return useMemo(() => computeLayout(healthyState), [healthyState])
}

/**
 * Manages resizable info panel state
 */
export function useInfoPanel() {
  const [infoPanelWidth, setInfoPanelWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(INFO_PANEL_LS_KEY)
      if (stored) {
        const parsed = Number(stored)
        if (parsed >= INFO_PANEL_MIN && parsed <= INFO_PANEL_MAX) return parsed
      }
    } catch { /* ignore */ }
    return INFO_PANEL_DEFAULT
  })
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false)
  const isOverInfoPanelRef = useRef(false)
  const hidePanelTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  return {
    infoPanelWidth,
    setInfoPanelWidth,
    infoPanelCollapsed,
    setInfoPanelCollapsed,
    isOverInfoPanelRef,
    hidePanelTimeoutRef,
  }
}

/**
 * Manages zoom state
 */
export function useZoom() {
  const [zoom, setZoom] = useState(1)
  return { zoom, setZoom }
}

/**
 * Manages animation toggle state
 */
export function useAnimations() {
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [labelsVisible, setLabelsVisible] = useState(true)
  return { animationsEnabled, setAnimationsEnabled, labelsVisible, setLabelsVisible }
}

/**
 * Manages edge and project hover state
 */
export function useHoverState() {
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null)
  const [hoveredProjectKey, setHoveredProjectKey] = useState<string | null>(null)
  const hoveredProjectName = hoveredProjectKey?.split('/')[1] ?? null
  const hoveredCluster = hoveredProjectKey?.split('/')[0] ?? null
  
  return {
    hoveredEdge,
    setHoveredEdge,
    hoveredProjectKey,
    setHoveredProjectKey,
    hoveredProjectName,
    hoveredCluster,
  }
}

/**
 * Manages drag & drop state
 */
export function useDragDrop() {
  const [dragProject, setDragProject] = useState<{ name: string; fromCluster: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  return { dragProject, setDragProject, dropTarget, setDropTarget }
}

/**
 * Manages pan/drag state for zoomed SVG
 */
export function usePan(svgContainerRef: RefObject<HTMLDivElement>, zoom: number) {
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const handlePanStart = (e: React.MouseEvent) => {
    if (zoom <= 1) return
    const container = svgContainerRef.current
    if (!container) return
    isPanningRef.current = true
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  return {
    handlePanStart,
    isPanningRef,
    panStartRef,
  }
}

/**
 * Manages info panel resize state
 */
export function useResize() {
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(INFO_PANEL_DEFAULT)

  const handleResizeStart = (e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault()
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = currentWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return {
    handleResizeStart,
    isResizingRef,
    startXRef,
    startWidthRef,
  }
}
