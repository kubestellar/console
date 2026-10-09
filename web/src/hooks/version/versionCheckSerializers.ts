import type { UpdateChannel } from '../../types/updates'
import { loadChannel, MIN_CHECK_INTERVAL_MS } from '../versionUtils'

export const VERSION_CHECK_CACHE_MAX_AGE_MS = MIN_CHECK_INTERVAL_MS

export function deserializeChannel(raw: string): UpdateChannel {
  if (raw === 'stable' || raw === 'unstable' || raw === 'developer') {
    return raw
  }
  return loadChannel()
}

export function deserializeLastChecked(raw: string): number | null {
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function deserializeSkippedVersions(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
}
