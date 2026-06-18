import type { InfoPanelData } from './FlightPlanBlueprintConstants'
import type {
  MissionControlState,
  PayloadProject,
} from './types'

export function resolveKbPath(project: PayloadProject): string | undefined {
  if (project.kbPath) return project.kbPath

  const slug = project.name.toLowerCase().replace(/\s+/g, '-')
  return `fixes/cncf-install/install-${slug}.json`
}

export function createDeployModePanelData(
  mode: MissionControlState['deployMode'],
  phases: MissionControlState['phases'],
): InfoPanelData {
  return { kind: 'deployMode', mode, phases }
}
