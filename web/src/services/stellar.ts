import { api } from '../lib/api'
import type {
  StellarAction,
  StellarDigest,
  StellarMission,
  StellarNotification,
  StellarOperationalState,
} from '../types/stellar'

export interface AskResponse {
  answer: string
  executionId: string
  model: string
  provider: string
  tokens: number
  durationMs: number
  state: StellarOperationalState
}

export const stellarApi = {
  async getState(): Promise<StellarOperationalState> {
    const { data } = await api.get<StellarOperationalState>('/api/stellar/state')
    return data
  },

  async getNotifications(limit = 50): Promise<StellarNotification[]> {
    const { data } = await api.get<{ items: StellarNotification[] }>(`/api/stellar/notifications?limit=${limit}`)
    return data.items || []
  },

  async getMissions(limit = 50): Promise<StellarMission[]> {
    const { data } = await api.get<{ items: StellarMission[] }>(`/api/stellar/missions?limit=${limit}`)
    return data.items || []
  },

  async getActions(status?: string, limit = 50): Promise<StellarAction[]> {
    const query = new URLSearchParams()
    query.set('limit', String(limit))
    if (status) query.set('status', status)
    const { data } = await api.get<{ items: StellarAction[] }>(`/api/stellar/actions?${query.toString()}`)
    return data.items || []
  },

  async ask(req: { prompt: string; cluster?: string; provider?: string; model?: string }): Promise<AskResponse> {
    const { data } = await api.post<AskResponse>('/api/stellar/ask', req)
    return data
  },

  async approveAction(id: string): Promise<StellarAction> {
    const { data } = await api.post<StellarAction>(`/api/stellar/actions/${encodeURIComponent(id)}/approve`, {})
    return data
  },

  async rejectAction(id: string, reason: string): Promise<StellarAction> {
    const { data } = await api.post<StellarAction>(`/api/stellar/actions/${encodeURIComponent(id)}/reject`, { reason })
    return data
  },

  async acknowledgeNotification(id: string): Promise<void> {
    await api.post(`/api/stellar/notifications/${encodeURIComponent(id)}/read`, {})
  },

  async createAction(payload: {
    description: string
    actionType: string
    parameters: Record<string, unknown>
    cluster: string
    namespace?: string
    scheduledAt?: string | null
  }): Promise<StellarAction> {
    const { data } = await api.post<StellarAction>('/api/stellar/actions', payload)
    return data
  },

  async getDigest(): Promise<{ digest: string; model: string; provider: string }> {
    const { data } = await api.get<{ digest: string; model: string; provider: string }>('/api/stellar/digest')
    return data
  },
}

export async function getStellarState(): Promise<StellarOperationalState> {
  return stellarApi.getState()
}

export async function getStellarNotifications(limit = 50): Promise<StellarNotification[]> {
  return stellarApi.getNotifications(limit)
}

export async function markStellarNotificationRead(id: string): Promise<void> {
  return stellarApi.acknowledgeNotification(id)
}

export async function getStellarMissions(limit = 50): Promise<StellarMission[]> {
  return stellarApi.getMissions(limit)
}

export async function getStellarActions(status?: string, limit = 50): Promise<StellarAction[]> {
  return stellarApi.getActions(status, limit)
}

export async function approveStellarAction(id: string): Promise<StellarAction> {
  return stellarApi.approveAction(id)
}

export async function rejectStellarAction(id: string, reason: string): Promise<StellarAction> {
  return stellarApi.rejectAction(id, reason)
}

export async function askStellar(prompt: string, cluster?: string): Promise<AskResponse> {
  return stellarApi.ask({ prompt, cluster })
}

export async function getStellarDigest(): Promise<StellarDigest> {
  const data = await stellarApi.getDigest()
  return {
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    overallHealth: data.digest,
    incidents: [],
    changes: [],
    recommendedActions: [],
  }
}
