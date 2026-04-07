/**
 * Ground Control Dashboard — Auto-Generation Hook
 *
 * Creates a monitoring dashboard scoped to the CNCF projects deployed
 * by a Mission Control session. Uses the project-to-card mapping to
 * select relevant monitoring cards and assigns grid positions automatically.
 */

import { useCallback } from 'react'
import { useDashboards } from './useDashboards'
import { getMonitoringCardsForProjects, type ProjectCardMappingResult } from '../lib/orbit/projectCardMapping'
import { GROUND_CONTROL_DASHBOARD_NAME_TEMPLATE } from '../lib/constants/orbit'
import { STORAGE_KEY_GROUND_CONTROL_DASHBOARDS } from '../lib/constants/storage'
import { safeGetJSON, safeSetJSON } from '../lib/utils/localStorage'
import { emitGroundControlDashboardCreated } from '../lib/analytics'
import type { DashboardCard } from './useDashboards'

/** Default card width in grid columns */
const DEFAULT_CARD_WIDTH = 6
/** Default card height in grid rows */
const DEFAULT_CARD_HEIGHT = 3

/**
 * Assign grid positions to cards in a 2-column flow layout.
 * Cards alternate between left (x=0) and right (x=6) columns.
 */
function assignGridPositions(cardTypes: string[]): DashboardCard[] {
  return cardTypes.map((cardType, index): DashboardCard => {
    const col = index % 2
    const row = Math.floor(index / 2)
    return {
      id: `gc-${cardType}-${index}`,
      card_type: cardType,
      config: {},
      position: {
        x: col * DEFAULT_CARD_WIDTH,
        y: row * DEFAULT_CARD_HEIGHT,
        w: DEFAULT_CARD_WIDTH,
        h: DEFAULT_CARD_HEIGHT,
      },
    }
  })
}

/** Mapping of Ground Control dashboard IDs to their orbit context */
interface GroundControlMapping {
  [dashboardId: string]: {
    createdAt: string
    projects: string[]
    orbitMissionId?: string
  }
}

export interface GroundControlDashboardResult {
  dashboardId: string
  /** Projects that had no direct card mapping (candidates for card request) */
  missingCardProjects: string[]
  /** Total number of cards placed on the dashboard */
  cardCount: number
}

export function useGroundControlDashboard() {
  const { createDashboard, updateDashboard } = useDashboards()

  const generateGroundControlDashboard = useCallback(async (params: {
    missionTitle: string
    projects: Array<{ name: string; cncfProject?: string; category?: string }>
  }): Promise<GroundControlDashboardResult> => {
    // Get cards for all projects
    const mapping: ProjectCardMappingResult = getMonitoringCardsForProjects(
      params.projects.map(p => ({ cncfProject: p.cncfProject, category: p.category }))
    )

    // Assign grid positions
    const cards = assignGridPositions(mapping.cards)

    // Generate dashboard name
    const projectNames = params.projects.map(p => p.name).join(', ')
    const dashboardName = GROUND_CONTROL_DASHBOARD_NAME_TEMPLATE.replace(
      '{project}',
      projectNames.length > 40 ? `${projectNames.slice(0, 37)}...` : projectNames
    )

    // Create the dashboard
    const dashboard = await createDashboard(dashboardName)

    // Add cards to the dashboard
    if (dashboard?.id && cards.length > 0) {
      await updateDashboard(dashboard.id, { cards })
    }

    // Track in Ground Control mapping (localStorage)
    const gcMapping = safeGetJSON<GroundControlMapping>(STORAGE_KEY_GROUND_CONTROL_DASHBOARDS) ?? {}
    gcMapping[dashboard.id] = {
      createdAt: new Date().toISOString(),
      projects: params.projects.map(p => p.name),
    }
    safeSetJSON(STORAGE_KEY_GROUND_CONTROL_DASHBOARDS, gcMapping)

    // Identify projects without direct card mappings
    const missingCardProjects = params.projects
      .filter(p => {
        const result = getMonitoringCardsForProjects([{ cncfProject: p.cncfProject, category: p.category }])
        return !result.hasDirectMapping
      })
      .map(p => p.name)

    emitGroundControlDashboardCreated(cards.length)

    return {
      dashboardId: dashboard.id,
      missingCardProjects,
      cardCount: cards.length,
    }
  }, [createDashboard, updateDashboard])

  /** Check if a dashboard ID is a Ground Control dashboard */
  const isGroundControlDashboard = useCallback((dashboardId: string): boolean => {
    const gcMapping = safeGetJSON<GroundControlMapping>(STORAGE_KEY_GROUND_CONTROL_DASHBOARDS) ?? {}
    return dashboardId in gcMapping
  }, [])

  return { generateGroundControlDashboard, isGroundControlDashboard }
}
