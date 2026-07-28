import { Stethoscope, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DeployMission } from '../../hooks/useDeployMissions'

interface MissionActionMenuProps {
  mission: DeployMission
  onDiagnose: (mission: DeployMission) => void
  onRepair: (mission: DeployMission) => void
}

export function MissionActionMenu({ mission, onDiagnose, onRepair }: MissionActionMenuProps) {
  const { t } = useTranslation(['common', 'cards'])

  return (
    <div className="px-3 pb-2 flex items-center gap-2">
      <button
        onClick={() => onDiagnose(mission)}
        className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 border border-purple-500/20 transition-colors"
        title={t('cards:missionsCard.diagnoseTitle')}
      >
        <Stethoscope className="w-3 h-3" />
        Diagnose
      </button>
      <button
        onClick={() => onRepair(mission)}
        className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
        title={t('cards:missionsCard.repairTitle')}
      >
        <Wrench className="w-3 h-3" />
        Repair
      </button>
    </div>
  )
}
