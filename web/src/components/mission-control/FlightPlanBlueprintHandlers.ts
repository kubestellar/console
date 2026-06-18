/**
 * FlightPlanBlueprintHandlers — Event handlers for FlightPlanBlueprint
 *
 * Extracted from FlightPlanBlueprint.tsx (#18875)
 */

import { useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { PayloadProject } from './types'
import type { MissionExport } from '../../lib/missions/types'
import { fetchMissionContent } from '../../lib/missions/missionCache'
import { INFO_PANEL_MIN, INFO_PANEL_MAX } from './FlightPlanBlueprintConstants'

export type InfoPanelData =
  | { kind: 'project'; info: ProjectHoverInfo }
  | { kind: 'cluster'; info: ClusterHoverInfo }
  | { kind: 'deployMode'; mode: 'phased' | 'yolo'; phases: unknown[] }

/** Resolve kbPath for a project — tries explicit kbPath, then convention-based lookup */
function resolveKbPath(proj: PayloadProject): string | undefined {
  if (proj.kbPath) return proj.kbPath
  // Convention: fixes/cncf-install/install-{name}.json
  const slug = proj.name.toLowerCase().replace(/\s+/g, '-')
  return `fixes/cncf-install/install-${slug}.json`
}

/**
 * Creates project hover handler
 */
export function createProjectHoverHandler(
  setInfoPanel: Dispatch<SetStateAction<InfoPanelData | null>>,
  setStickyPanel: Dispatch<SetStateAction<InfoPanelData | null>>,
  hidePanelTimeoutRef: RefObject<NodeJS.Timeout | null>
) {
  return (info: ProjectHoverInfo | null) => {
    // Clear any pending hide timeout
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }

    if (info) {
      const data: InfoPanelData = { kind: 'project', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }
}

/**
 * Creates cluster hover handler
 */
export function createClusterHoverHandler(
  setInfoPanel: Dispatch<SetStateAction<InfoPanelData | null>>,
  setStickyPanel: Dispatch<SetStateAction<InfoPanelData | null>>,
  hidePanelTimeoutRef: RefObject<NodeJS.Timeout | null>,
  dragProject: { name: string; fromCluster: string } | null
) {
  return (info: ClusterHoverInfo | null) => {
    if (dragProject) return

    // Clear any pending hide timeout
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }

    if (info) {
      const data: InfoPanelData = { kind: 'cluster', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }
}

/**
 * Creates info panel mouse event handlers
 */
export function createInfoPanelHandlers(
  isOverInfoPanelRef: RefObject<boolean>,
  hidePanelTimeoutRef: RefObject<NodeJS.Timeout | null>
) {
  const handleInfoPanelEnter = () => {
    isOverInfoPanelRef.current = true
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }
  }

  const handleInfoPanelLeave = () => {
    isOverInfoPanelRef.current = false
  }

  return { handleInfoPanelEnter, handleInfoPanelLeave }
}

/**
 * Creates mission preview handler
 */
export function createMissionPreviewHandler(
  setPreviewMission: Dispatch<SetStateAction<MissionExport | null>>,
  setPreviewLoading: Dispatch<SetStateAction<boolean>>
) {
  return (proj: PayloadProject) => {
    const kbPath = resolveKbPath(proj)
    const baseMission: MissionExport = {
      version: 'kc-mission-v1',
      title: `Install ${proj.displayName}`,
      description: proj.reason ?? '',
      type: 'deploy',
      tags: [proj.category],
      steps: [],
      metadata: { source: kbPath ?? 'mission-control' },
    }
    if (!kbPath) {
      setPreviewMission(baseMission)
      return
    }
    setPreviewLoading(true)
    fetchMissionContent(baseMission)
      .then(({ mission: m }) => setPreviewMission(m))
      .catch(() => setPreviewMission(baseMission))
      .finally(() => setPreviewLoading(false))
  }
}

/**
 * Hook that sets up pan event listeners
 */
export function usePanListeners(
  isPanningRef: RefObject<boolean>,
  panStartRef: RefObject<{ x: number; y: number; scrollLeft: number; scrollTop: number }>,
  svgContainerRef: RefObject<HTMLDivElement>
) {
  useEffect(() => {
    const handlePanMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return
      const container = svgContainerRef.current
      if (!container) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      container.scrollLeft = panStartRef.current.scrollLeft - dx
      container.scrollTop = panStartRef.current.scrollTop - dy
    }
    const handlePanEnd = () => {
      if (!isPanningRef.current) return
      isPanningRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handlePanMove)
    window.addEventListener('mouseup', handlePanEnd)
    return () => {
      window.removeEventListener('mousemove', handlePanMove)
      window.removeEventListener('mouseup', handlePanEnd)
    }
  }, [isPanningRef, panStartRef, svgContainerRef])
}

/**
 * Hook that sets up resize event listeners
 */
export function useResizeListeners(
  isResizingRef: RefObject<boolean>,
  startXRef: RefObject<number>,
  startWidthRef: RefObject<number>,
  setInfoPanelWidth: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isResizingRef.current) return
      const deltaX = e.clientX - startXRef.current
      const newWidth = Math.min(INFO_PANEL_MAX, Math.max(INFO_PANEL_MIN, startWidthRef.current - deltaX))
      setInfoPanelWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setInfoPanelWidth((w) => {
        try {
          localStorage.setItem('kc-blueprint-info-panel-width', String(w))
        } catch {
          /* ignore */
        }
        return w
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingRef, startXRef, startWidthRef, setInfoPanelWidth])
}

/**
 * Hook that cleans up hide panel timeout on unmount
 */
export function useCleanupTimeout(hidePanelTimeoutRef: RefObject<NodeJS.Timeout | null>) {
  useEffect(() => {
    return () => {
      if (hidePanelTimeoutRef.current) {
        clearTimeout(hidePanelTimeoutRef.current)
      }
    }
  }, [hidePanelTimeoutRef])
}
