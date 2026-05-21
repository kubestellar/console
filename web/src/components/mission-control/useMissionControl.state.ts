import { isDemoMode } from '../../lib/demoMode'
import { logger } from '@/lib/logger'
import { getDemoMissionControlState } from './demoState'
import {
  STORAGE_KEY,
  WIZARD_STATE_TTL_MS,
  PERSISTED_SCHEMA_VERSION,
  QUOTA_BANNER_KEY,
} from './useMissionControl.constants'
import type { MissionControlState } from './types'
import type { PersistedStateEntry } from './useMissionControl.types'

let quotaBannerFallbackTitle: string | null = null

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getDemoOrNull(): Partial<MissionControlState> | null {
  return isDemoMode() ? getDemoMissionControlState() : null
}

export function loadPersistedState(): Partial<MissionControlState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDemoOrNull()

    const parsedRaw: unknown = JSON.parse(raw)
    if (!isPlainObject(parsedRaw)) {
      logger.warn(
        `[MissionControl] issue 6664 — persisted state at "${STORAGE_KEY}" is not a plain object ` +
          `(typeof=${typeof parsedRaw}, isArray=${Array.isArray(parsedRaw)}); clearing.`,
      )
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      return getDemoOrNull()
    }

    const entry = parsedRaw as PersistedStateEntry | Partial<MissionControlState>
    if ('savedAt' in entry && typeof entry.savedAt === 'number') {
      if (
        entry.schemaVersion !== undefined &&
        entry.schemaVersion !== PERSISTED_SCHEMA_VERSION
      ) {
        logger.warn(
          `[MissionControl] issue 6664 — persisted schema version ${entry.schemaVersion} ` +
            `does not match current ${PERSISTED_SCHEMA_VERSION}; clearing.`,
        )
        try { sessionStorage.setItem(QUOTA_BANNER_KEY, 'schema_mismatch') } catch { /* ignore */ }
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
        return getDemoOrNull()
      }

      if (Date.now() - entry.savedAt > WIZARD_STATE_TTL_MS) {
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
        return getDemoOrNull()
      }

      const persistedState = entry.state
      if (isDemoMode() && (!persistedState?.projects || persistedState.projects.length === 0)) {
        return getDemoMissionControlState()
      }
      return persistedState
    }

    const legacy = entry as Partial<MissionControlState>
    if (isDemoMode() && (!legacy.projects || legacy.projects.length === 0)) {
      return getDemoMissionControlState()
    }
    return legacy
  } catch {
    return null
  }
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22)
  )
}

export function persistState(state: MissionControlState): void {
  try {
    const entry: PersistedStateEntry = {
      state,
      savedAt: Date.now(),
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch (error: unknown) {
    if (isQuotaExceededError(error)) {
      const title = state.title || '(untitled mission)'
      logger.warn(
        `[MissionControl] issue 6665 — localStorage quota exceeded while ` +
          `persisting Mission Control wizard state for "${title}". Your ` +
          `in-progress draft is not being persisted and will be lost on ` +
          `reload unless space is freed.`,
      )
      try {
        sessionStorage.setItem(QUOTA_BANNER_KEY, title)
        quotaBannerFallbackTitle = null
      } catch {
        quotaBannerFallbackTitle = title
      }
      return
    }
    logger.error('[MissionControl] Failed to persist state:', error)
  }
}

export function consumePersistQuotaBanner(): string | null {
  try {
    const value = sessionStorage.getItem(QUOTA_BANNER_KEY)
    if (value !== null) sessionStorage.removeItem(QUOTA_BANNER_KEY)
    return value
  } catch {
    const fallback = quotaBannerFallbackTitle
    quotaBannerFallbackTitle = null
    return fallback
  }
}

export function clearPersistedState(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function makeInitialState(
  persisted?: Partial<MissionControlState> | null,
): MissionControlState {
  return {
    phase: persisted?.phase ?? 'define',
    description: persisted?.description ?? '',
    title: persisted?.title ?? '',
    projects: persisted?.projects ?? [],
    originalAISuggestions: persisted?.originalAISuggestions,
    assignments: persisted?.assignments ?? [],
    phases: persisted?.phases ?? [],
    overlay: persisted?.overlay ?? 'architecture',
    deployMode: persisted?.deployMode ?? 'phased',
    isDryRun: persisted?.isDryRun ?? false,
    targetClusters: persisted?.targetClusters ?? [],
    planningMissionId: persisted?.planningMissionId,
    aiStreaming: false,
    launchProgress: persisted?.launchProgress ?? [],
    groundControlDashboardId: persisted?.groundControlDashboardId,
  }
}
