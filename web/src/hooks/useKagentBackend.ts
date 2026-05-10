import { useCallback, useEffect, useState } from 'react'
import { fetchKagentStatus, fetchKagentAgents, type KagentAgent, type KagentStatus } from '../lib/kagentBackend'
import { fetchKagentiProviderStatus, fetchKagentiProviderAgents, type KagentiProviderAgent, type KagentiProviderStatus } from '../lib/kagentiProviderBackend'

const POLL_INTERVAL_MS = 30_000
const BACKEND_REFRESH_MIN_INTERVAL_MS = 2_000
const KAGENT_SELECTED_AGENT_KEY = 'kc_kagent_selected_agent'
const KAGENTI_SELECTED_AGENT_KEY = 'kc_kagenti_selected_agent'
const BACKEND_PREF_KEY = 'kc_agent_backend_preference'

type BackendState = {
  kagentStatus: KagentStatus | null
  kagentAgents: KagentAgent[]
  selectedKagentAgent: KagentAgent | null
  kagentiStatus: KagentiProviderStatus | null
  kagentiAgents: KagentiProviderAgent[]
  selectedKagentiAgent: KagentiProviderAgent | null
  preferredBackend: AgentBackendType
  hasPolled: boolean
}

type BackendListener = (state: BackendState) => void

const listeners = new Set<BackendListener>()
let sharedState = createInitialState()
let pollIntervalRef: ReturnType<typeof setInterval> | null = null
let activeRefreshController: AbortController | null = null
let refreshPromise: Promise<void> | null = null
let refreshTimerRef: ReturnType<typeof setTimeout> | null = null
let lastRefreshAt = 0

export type AgentBackendType = 'kc-agent' | 'kagent' | 'kagenti'

export interface UseKagentBackendResult {
  /** Whether kagent is available in the cluster */
  kagentAvailable: boolean
  /** Kagent status details */
  kagentStatus: KagentStatus | null
  /** List of available kagent agents */
  kagentAgents: KagentAgent[]
  /** Currently selected kagent agent */
  selectedKagentAgent: KagentAgent | null
  /** Select a kagent agent */
  selectKagentAgent: (agent: KagentAgent) => void

  /** Whether kagenti is available in the cluster */
  kagentiAvailable: boolean
  /** Kagenti status details */
  kagentiStatus: KagentiProviderStatus | null
  /** List of available kagenti agents */
  kagentiAgents: KagentiProviderAgent[]
  /** Currently selected kagenti agent */
  selectedKagentiAgent: KagentiProviderAgent | null
  /** Select a kagenti agent */
  selectKagentiAgent: (agent: KagentiProviderAgent) => void

  /** User's preferred backend */
  preferredBackend: AgentBackendType
  /** Set preferred backend */
  setPreferredBackend: (backend: AgentBackendType) => void
  /** The active backend (based on preference + availability) */
  activeBackend: AgentBackendType
  /** True once the first status poll has completed */
  hasPolled: boolean
  /** Refresh all statuses */
  refresh: () => Promise<void>
}

function getStoredValue(key: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(key)
}

function setStoredValue(key: string, value: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, value)
}

function getStoredPreferredBackend(): AgentBackendType {
  const saved = getStoredValue(BACKEND_PREF_KEY)
  if (saved === 'kagent' || saved === 'kagenti') return saved
  return 'kc-agent'
}

function createInitialState(): BackendState {
  return {
    kagentStatus: null,
    kagentAgents: [],
    selectedKagentAgent: null,
    kagentiStatus: null,
    kagentiAgents: [],
    selectedKagentiAgent: null,
    preferredBackend: getStoredPreferredBackend(),
    hasPolled: false,
  }
}

function emitState(): void {
  listeners.forEach(listener => listener(sharedState))
}

function setSharedState(updater: (current: BackendState) => BackendState): void {
  sharedState = updater(sharedState)
  emitState()
}

function restoreSelectedAgent<T extends { name: string; namespace: string }>(
  currentSelection: T | null,
  agents: T[],
  storageKey: string,
  isAvailable: boolean,
): T | null {
  if (!isAvailable || currentSelection) return currentSelection

  const savedName = getStoredValue(storageKey)
  if (!savedName) return currentSelection

  return (agents || []).find(agent => `${agent.namespace}/${agent.name}` === savedName) ?? currentSelection
}

function computeActiveBackend(
  preferredBackend: AgentBackendType,
  hasPolled: boolean,
  kagentAvailable: boolean,
  kagentiAvailable: boolean,
): AgentBackendType {
  if (!hasPolled) return preferredBackend
  if (preferredBackend === 'kagenti' && kagentiAvailable) return 'kagenti'
  if (preferredBackend === 'kagent' && kagentAvailable) return 'kagent'
  return 'kc-agent'
}

function scheduleRefresh(delayMs: number): void {
  if (refreshTimerRef) return

  refreshTimerRef = setTimeout(() => {
    refreshTimerRef = null
    void runRefresh(true)
  }, delayMs)
}

async function runRefresh(bypassThrottle = false): Promise<void> {
  if (refreshPromise) return refreshPromise

  const elapsedSinceLastRefresh = Date.now() - lastRefreshAt
  if (!bypassThrottle && elapsedSinceLastRefresh < BACKEND_REFRESH_MIN_INTERVAL_MS) {
    scheduleRefresh(BACKEND_REFRESH_MIN_INTERVAL_MS - elapsedSinceLastRefresh)
    return
  }

  lastRefreshAt = Date.now()
  const controller = new AbortController()
  activeRefreshController = controller

  refreshPromise = (async () => {
    try {
      const [kStatus, kiStatus] = await Promise.all([
        fetchKagentStatus({ signal: controller.signal }),
        fetchKagentiProviderStatus({ signal: controller.signal }),
      ])

      if (controller.signal.aborted) return

      const [kagentAgentsList, kagentiAgentsList] = await Promise.all([
        kStatus.available ? fetchKagentAgents({ signal: controller.signal }) : Promise.resolve([] as KagentAgent[]),
        kiStatus.available ? fetchKagentiProviderAgents({ signal: controller.signal }) : Promise.resolve([] as KagentiProviderAgent[]),
      ])

      if (controller.signal.aborted) return

      setSharedState(current => ({
        ...current,
        kagentStatus: kStatus,
        kagentiStatus: kiStatus,
        kagentAgents: kagentAgentsList,
        kagentiAgents: kagentiAgentsList,
        selectedKagentAgent: restoreSelectedAgent(
          current.selectedKagentAgent,
          kagentAgentsList,
          KAGENT_SELECTED_AGENT_KEY,
          kStatus.available,
        ),
        selectedKagentiAgent: restoreSelectedAgent(
          current.selectedKagentiAgent,
          kagentiAgentsList,
          KAGENTI_SELECTED_AGENT_KEY,
          kiStatus.available,
        ),
        hasPolled: true,
      }))
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setSharedState(current => ({ ...current, hasPolled: true }))
    } finally {
      if (activeRefreshController === controller) {
        activeRefreshController = null
      }
      refreshPromise = null
    }
  })()

  return refreshPromise
}

function startPolling(): void {
  if (pollIntervalRef) return

  void runRefresh()
  pollIntervalRef = setInterval(() => {
    void runRefresh()
  }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollIntervalRef) {
    clearInterval(pollIntervalRef)
    pollIntervalRef = null
  }
  if (refreshTimerRef) {
    clearTimeout(refreshTimerRef)
    refreshTimerRef = null
  }

  const controller = activeRefreshController
  activeRefreshController = null
  refreshPromise = null
  controller?.abort()
  sharedState = createInitialState()
}

export function __resetForTest(): void {
  if (pollIntervalRef) {
    clearInterval(pollIntervalRef)
    pollIntervalRef = null
  }
  if (refreshTimerRef) {
    clearTimeout(refreshTimerRef)
    refreshTimerRef = null
  }

  const controller = activeRefreshController
  activeRefreshController = null
  refreshPromise = null
  controller?.abort()
  listeners.clear()
  lastRefreshAt = 0
  sharedState = createInitialState()
}

function selectKagentAgentInStore(agent: KagentAgent): void {
  setStoredValue(KAGENT_SELECTED_AGENT_KEY, `${agent.namespace}/${agent.name}`)
  setSharedState(current => ({ ...current, selectedKagentAgent: agent }))
}

function selectKagentiAgentInStore(agent: KagentiProviderAgent): void {
  setStoredValue(KAGENTI_SELECTED_AGENT_KEY, `${agent.namespace}/${agent.name}`)
  setSharedState(current => ({ ...current, selectedKagentiAgent: agent }))
}

function setPreferredBackendInStore(backend: AgentBackendType): void {
  setStoredValue(BACKEND_PREF_KEY, backend)
  setSharedState(current => ({ ...current, preferredBackend: backend }))
}

export function useKagentBackend(): UseKagentBackendResult {
  const [state, setState] = useState(sharedState)

  useEffect(() => {
    const listener: BackendListener = nextState => {
      setState(nextState)
    }

    listeners.add(listener)
    setState(sharedState)
    startPolling()

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        stopPolling()
      }
    }
  }, [])

  const refresh = useCallback(() => runRefresh(true), [])

  const selectKagentAgent = useCallback((agent: KagentAgent) => {
    selectKagentAgentInStore(agent)
  }, [])

  const selectKagentiAgent = useCallback((agent: KagentiProviderAgent) => {
    selectKagentiAgentInStore(agent)
  }, [])

  const setPreferredBackend = useCallback((backend: AgentBackendType) => {
    setPreferredBackendInStore(backend)
  }, [])

  const kagentAvailable = state.kagentStatus?.available ?? false
  const kagentiAvailable = state.kagentiStatus?.available ?? false
  const activeBackend = computeActiveBackend(
    state.preferredBackend,
    state.hasPolled,
    kagentAvailable,
    kagentiAvailable,
  )

  return {
    kagentAvailable,
    kagentStatus: state.kagentStatus,
    kagentAgents: state.kagentAgents,
    selectedKagentAgent: state.selectedKagentAgent,
    selectKagentAgent,
    kagentiAvailable,
    kagentiStatus: state.kagentiStatus,
    kagentiAgents: state.kagentiAgents,
    selectedKagentiAgent: state.selectedKagentiAgent,
    selectKagentiAgent,
    preferredBackend: state.preferredBackend,
    setPreferredBackend,
    activeBackend,
    hasPolled: state.hasPolled,
    refresh,
  }
}

export const __testables = {
  BACKEND_REFRESH_MIN_INTERVAL_MS,
}
