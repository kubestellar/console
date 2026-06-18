import { useState } from 'react'
import { fetchMissionContent } from '../../lib/missions/missionCache'
import type { MissionExport } from '../../lib/missions/types'
import { resolveKbPath } from './FlightPlanBlueprint.utils'
import type { PayloadProject } from './types'

export function useFlightPlanMissionPreview() {
  const [previewMission, setPreviewMission] = useState<MissionExport | null>(null)
  const [previewRaw, setPreviewRaw] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  const showMissionPreview = (project: PayloadProject) => {
    const kbPath = resolveKbPath(project)
    const baseMission: MissionExport = {
      version: 'kc-mission-v1',
      title: `Install ${project.displayName}`,
      description: project.reason ?? '',
      type: 'deploy',
      tags: [project.category],
      steps: [],
      metadata: { source: kbPath ?? 'mission-control' },
    }

    if (!kbPath) {
      setPreviewMission(baseMission)
      return
    }

    setPreviewLoading(true)
    fetchMissionContent(baseMission)
      .then(({ mission }) => setPreviewMission(mission))
      .catch(() => setPreviewMission(baseMission))
      .finally(() => setPreviewLoading(false))
  }

  const closeMissionPreview = () => {
    setPreviewMission(null)
    setPreviewRaw(false)
  }

  return {
    previewMission,
    previewRaw,
    previewLoading,
    showMissionPreview,
    closeMissionPreview,
    togglePreviewRaw: () => setPreviewRaw(current => !current),
  }
}
