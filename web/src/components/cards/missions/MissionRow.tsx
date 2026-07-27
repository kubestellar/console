import type { DeployMission, DeployMissionStatus } from '../../../hooks/useDeployMissions'

interface MissionRowProps {
  mission: DeployMission
  expanded: boolean
  onToggleExpand: (missionId: string) => void
}

export function MissionRow({ mission, expanded, onToggleExpand }: MissionRowProps) {
  return (
    <div
      onClick={() => onToggleExpand(mission.missionId)}
      className="cursor-pointer"
    >
      <div className="p-3 border-b border-border/50 hover:bg-accent/5 transition-colors">
        <div className="font-semibold text-sm">{mission.missionId}</div>
        {expanded && (
          <div className="mt-2 text-xs text-muted-foreground">
            Status: {mission.status}
          </div>
        )}
      </div>
    </div>
  )
}
