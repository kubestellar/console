import type { TokenCategory } from '../hooks/useTokenUsage'
import type { Mission } from '../hooks/useMissionTypes'

type MissionType = Mission['type']

const MISSION_TYPE_TO_TOKEN_CATEGORY: Record<MissionType, TokenCategory> = {
  troubleshoot: 'diagnose',
  analyze: 'insights',
  upgrade: 'missions',
  deploy: 'missions',
  repair: 'missions',
  custom: 'missions',
  maintain: 'missions',
}

export function getTokenCategoryForMissionType(missionType?: MissionType): TokenCategory {
  if (!missionType) return 'missions'
  return MISSION_TYPE_TO_TOKEN_CATEGORY[missionType] ?? 'missions'
}
