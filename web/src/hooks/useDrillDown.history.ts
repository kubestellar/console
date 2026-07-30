export const DRILLDOWN_HISTORY_STATE_KEY = '__kscDrillDownHistoryId'
export const MAX_DRILLDOWN_HISTORY_ENTRIES = 100

export type BrowserHistoryState = Record<string, unknown>

export function canUseBrowserHistory() {
  return typeof window !== 'undefined' && typeof window.history !== 'undefined'
}

export function getCurrentBrowserHistoryState(): BrowserHistoryState {
  if (!canUseBrowserHistory()) return {}
  const currentState = window.history.state
  return currentState && typeof currentState === 'object'
    ? currentState as BrowserHistoryState
    : {}
}

export function getDrillDownHistoryEntryId(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const entryId = (state as BrowserHistoryState)[DRILLDOWN_HISTORY_STATE_KEY]
  return typeof entryId === 'number' ? entryId : null
}
