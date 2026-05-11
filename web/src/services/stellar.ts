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
  providerSource: 'request' | 'user-default' | 'env-default' | 'fallback'
  tokens: number
  durationMs: number
  fallbackUsed?: boolean
  fallbackReason?: string
  state: StellarOperationalState
}

export interface ProviderInfo {
  name: string
  displayName: string
  model: string
  available: boolean
  latencyMs: number
  supportsStreaming: boolean
  isUserDefined?: boolean
  configId?: string
}

export interface UserProviderConfig {
  id: string
  provider: string
  displayName: string
  model: string
  baseUrl: string
  apiKeyMask?: string
  isDefault: boolean
  isActive: boolean
  lastLatency: number
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

  async approveAction(id: string, confirmToken?: string): Promise<StellarAction> {
    const { data } = await api.post<StellarAction>(`/api/stellar/actions/${encodeURIComponent(id)}/approve`, { confirmToken })
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

  async getProviders(): Promise<{ global: ProviderInfo[]; user: UserProviderConfig[] }> {
    const { data } = await api.get<{ global: ProviderInfo[]; user: UserProviderConfig[] }>('/api/stellar/providers')
    return data
  },

  async createProvider(payload: { provider: string; displayName: string; apiKey: string; model: string; baseUrl?: string }): Promise<UserProviderConfig> {
    const { data } = await api.post<UserProviderConfig>('/api/stellar/providers', payload)
    return data
  },

  async testProvider(id: string): Promise<{ available: boolean; latencyMs: number; error?: string }> {
    const { data } = await api.post<{ available: boolean; latencyMs: number; error?: string }>(`/api/stellar/providers/${encodeURIComponent(id)}/test`, {})
    return data
  },

  async deleteProvider(id: string): Promise<void> {
    await api.delete(`/api/stellar/providers/${encodeURIComponent(id)}`)
  },

  async setDefaultProvider(id: string): Promise<void> {
    await api.post(`/api/stellar/providers/${encodeURIComponent(id)}/default`, {})
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

export async function approveStellarAction(id: string, confirmToken?: string): Promise<StellarAction> {
  return stellarApi.approveAction(id, confirmToken)
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
