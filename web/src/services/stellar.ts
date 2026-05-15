import { api } from '../lib/api'
import type {
  StellarAction,
  StellarAuditEntry,
  StellarDigest,
  StellarMission,
  StellarNotification,
  StellarTask,
  StellarOperationalState,
  StellarWatch,
} from '../types/stellar'

const STELLAR_CHAT_TIMEOUT_MS = 300_000

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
  watchCreated: boolean
  watchId: string
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
    try {
      const { data } = await api.get<StellarOperationalState>('/api/stellar/state')
      return data
    } catch (err) {
      console.warn('stellar: getState failed:', err)
      return {
        generatedAt: new Date().toISOString(),
        clustersWatching: [],
        eventCounts: { critical: 0, warning: 0, info: 0 },
        recentEvents: [],
        unreadAlerts: 0,
        activeMissionIds: [],
        pendingActionIds: [],
      }
    }
  },

  async getNotifications(limit = 50, unreadOnly = false): Promise<StellarNotification[]> {
    try {
      const query = new URLSearchParams()
      query.set('limit', String(limit))
      if (unreadOnly) query.set('unread', 'true')
      const { data } = await api.get<{ items: StellarNotification[] }>(`/api/stellar/notifications?${query.toString()}`)
      return data.items || []
    } catch (err) {
      console.warn('stellar: getNotifications failed:', err)
      return []
    }
  },

  async getMissions(limit = 50): Promise<StellarMission[]> {
    try {
      const { data } = await api.get<{ items: StellarMission[] }>(`/api/stellar/missions?limit=${limit}`)
      return data.items || []
    } catch (err) {
      console.warn('stellar: getMissions failed:', err)
      return []
    }
  },

  async getActions(status?: string, limit = 50): Promise<StellarAction[]> {
    try {
      const query = new URLSearchParams()
      query.set('limit', String(limit))
      if (status) query.set('status', status)
      const { data } = await api.get<{ items: StellarAction[] }>(`/api/stellar/actions?${query.toString()}`)
      return data.items || []
    } catch (err) {
      console.warn('stellar: getActions failed:', err)
      return []
    }
  },

  async ask(req: { prompt: string; cluster?: string; provider?: string; model?: string; history?: { role: string; content: string }[] }): Promise<AskResponse> {
    const { data } = await api.post<AskResponse>('/api/stellar/ask', req, { timeout: STELLAR_CHAT_TIMEOUT_MS })
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

  async getTasks(): Promise<StellarTask[]> {
    try {
      const { data } = await api.get<{ items: StellarTask[] }>('/api/stellar/tasks')
      return data.items || []
    } catch (err) {
      console.warn('stellar: getTasks failed:', err)
      return []
    }
  },

  async createTask(payload: {
    sessionId?: string
    cluster?: string
    title: string
    description?: string
    priority?: number
    source?: string
    parentId?: string
    dueAt?: string
    contextJson?: string
  }): Promise<StellarTask> {
    const { data } = await api.post<StellarTask>('/api/stellar/tasks', payload)
    return data
  },

  async updateTaskStatus(id: string, status: string): Promise<void> {
    await api.post(`/api/stellar/tasks/${encodeURIComponent(id)}/status`, { status })
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

  async executeAction(payload: {
    actionType: string
    cluster: string
    namespace?: string
    name?: string
    description?: string
    prompt?: string
    parameters?: Record<string, unknown>
  }): Promise<{ id: string; status: string; outcome: string; model?: string; provider?: string; duration: number }> {
    const { data } = await api.post<{ id: string; status: string; outcome: string; model?: string; provider?: string; duration: number }>(
      '/api/stellar/actions/execute',
      payload,
      { timeout: STELLAR_CHAT_TIMEOUT_MS },
    )
    return data
  },

  async getDigest(): Promise<{ digest: string; model: string; provider: string }> {
    try {
      const { data } = await api.get<{ digest: string; model: string; provider: string }>('/api/stellar/digest')
      return data
    } catch (err) {
      console.warn('stellar: getDigest failed:', err)
      return { digest: '', model: '', provider: '' }
    }
  },

  async getProviders(): Promise<{ global: ProviderInfo[]; user: UserProviderConfig[] }> {
    try {
      const { data } = await api.get<{ global: ProviderInfo[]; user: UserProviderConfig[] }>('/api/stellar/providers')
      return data
    } catch (err) {
      console.warn('stellar: getProviders failed:', err)
      return { global: [], user: [] }
    }
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

  async getWatches(): Promise<StellarWatch[]> {
    try {
      const { data } = await api.get<{ items: StellarWatch[] }>('/api/stellar/watches')
      return data.items || []
    } catch (err) {
      console.warn('stellar: getWatches failed:', err)
      return []
    }
  },

  async resolveWatch(id: string): Promise<void> {
    await api.post(`/api/stellar/watches/${encodeURIComponent(id)}/resolve`, {})
  },

  async dismissWatch(id: string): Promise<void> {
    await api.delete(`/api/stellar/watches/${encodeURIComponent(id)}`)
  },

  async snoozeWatch(id: string, minutes: number): Promise<void> {
    await api.post(`/api/stellar/watches/${encodeURIComponent(id)}/snooze`, { minutes })
  },

  async getAuditLog(limit = 50): Promise<StellarAuditEntry[]> {
    try {
      const { data } = await api.get<{ items: StellarAuditEntry[] }>(`/api/stellar/audit?limit=${limit}`)
      return data.items || []
    } catch (err) {
      console.warn('stellar: getAuditLog failed:', err)
      return []
    }
  },
  async startSolve(eventID: string): Promise<{ solveId: string; status: string; existing?: boolean }> {
    const { data } = await api.post<{ solveId: string; status: string; existing?: boolean }>(`/api/stellar/solve/${eventID}`)
    return data
  },
  async listSolves(limit = 100): Promise<import('../types/stellar').StellarSolve[]> {
    try {
      const { data } = await api.get<{ items: import('../types/stellar').StellarSolve[] }>(`/api/stellar/solves?limit=${limit}`)
      return data.items || []
    } catch (err) {
      console.warn('stellar: listSolves failed:', err)
      return []
    }
  },
  async listActivity(limit = 100): Promise<import('../types/stellar').StellarActivity[]> {
    try {
      const { data } = await api.get<{ items: import('../types/stellar').StellarActivity[] }>(`/api/stellar/activity?limit=${limit}`)
      return data.items || []
    } catch (err) {
      console.warn('stellar: listActivity failed:', err)
      return []
    }
  },
}

export async function getStellarState(): Promise<StellarOperationalState> {
  return stellarApi.getState()
}

export async function getStellarNotifications(limit = 50, unreadOnly = false): Promise<StellarNotification[]> {
  return stellarApi.getNotifications(limit, unreadOnly)
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

export async function getStellarTasks(): Promise<StellarTask[]> {
  return stellarApi.getTasks()
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
