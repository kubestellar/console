import type { AutoUpdateStatus, UpdateChannel } from '../../types/updates'
import { authFetch } from '../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import {
  CANCEL_UPDATE_TIMEOUT_MS,
  safeJsonParse,
  TRIGGER_UPDATE_TIMEOUT_MS,
} from '../versionUtils'
import type { CheckAttemptResult } from './useReleasesFetch'

type AutoUpdateMutationResult = {
  success: boolean
  error?: string
}

export type AutoUpdateStatusResult = CheckAttemptResult & {
  data?: AutoUpdateStatus
}

const AUTO_UPDATE_CONFIG_TIMEOUT_MS = 3000

export async function fetchAutoUpdateStatus(
  agentSupportsAutoUpdate: boolean,
): Promise<AutoUpdateStatusResult> {
  if (!agentSupportsAutoUpdate) {
    return { success: false, errorMessage: 'Could not reach kc-agent' }
  }

  try {
    const response = await authFetch('/api/agent/auto-update/status', {
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (response.ok) {
      return {
        success: true,
        data: await safeJsonParse<AutoUpdateStatus>(response, 'Auto-update status'),
      }
    }

    return {
      success: false,
      errorMessage: `kc-agent returned ${response.status}`,
    }
  } catch {
    return {
      success: false,
      errorMessage: 'Could not reach kc-agent',
    }
  }
}

export async function syncAutoUpdateConfig(
  enabled: boolean,
  channel: UpdateChannel,
): Promise<void> {
  try {
    await authFetch('/api/agent/auto-update/config', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, channel }),
      signal: AbortSignal.timeout(AUTO_UPDATE_CONFIG_TIMEOUT_MS),
    })
  } catch {
    // Agent not available, local state is still persisted.
  }
}

export async function triggerUpdate(channel: UpdateChannel): Promise<AutoUpdateMutationResult> {
  try {
    const response = await authFetch('/api/agent/auto-update/trigger', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
      signal: AbortSignal.timeout(TRIGGER_UPDATE_TIMEOUT_MS),
    })

    if (response.ok) {
      return { success: true }
    }

    return {
      success: false,
      error: response.status === 404
        ? 'kc-agent does not support auto-update yet — restart with latest code'
        : `kc-agent returned ${response.status}`,
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'kc-agent not reachable',
    }
  }
}

export async function cancelUpdate(): Promise<AutoUpdateMutationResult> {
  try {
    const response = await authFetch('/api/agent/auto-update/cancel', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CANCEL_UPDATE_TIMEOUT_MS),
    })

    if (response.ok) {
      return { success: true }
    }

    if (response.status === 409) {
      return { success: false, error: 'No update in progress' }
    }

    return {
      success: false,
      error: response.status === 404
        ? 'kc-agent does not support cancel yet — restart with latest code'
        : `kc-agent returned ${response.status}`,
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'kc-agent not reachable',
    }
  }
}
