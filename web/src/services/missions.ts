import { api } from '../lib/api'

export interface ValidateMissionResponse {
  valid: boolean
  errors?: string[]
  qualityPass?: boolean | null
  qualityScore?: number | null
  testedOn?: unknown
}

export async function validateMission(mission: unknown, path: string): Promise<ValidateMissionResponse> {
  const { data } = await api.post<ValidateMissionResponse>('/api/missions/validate', {
    mission,
    path,
  })
  return data
}
