import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchKagentStatus, fetchKagentAgents, type KagentAgent, type KagentStatus } from '../lib/kagentBackend'
import { fetchKagentiProviderStatus, fetchKagentiProviderAgents, type KagentiProviderAgent, type KagentiProviderStatus } from '../lib/kagentiProviderBackend'

const POLL_INTERVAL_MS = 30_000
const KAGENT_SELECTED_AGENT_KEY = 'kc_kagent_selected_agent'
const KAGENTI_SELECTED_AGENT_KEY = 'kc_kagenti_selected_agent'
const BACKEND_PREF_KEY = 'kc_agent_backend_preference'

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
  /** Refresh all statuses */
  refresh: () => void
}

export function useKagentBackend(): UseKagentBackendResult {
  // Kagent state
  const [kagentStatus, setKagentStatus] = useState<KagentStatus | null>(null)
  const [kagentAgents, setKagentAgents] = useState<KagentAgent[]>([])
  const [selectedKagentAgent, setSelectedKagentAgent] = useState<KagentAgent | null>(null)

  // Kagenti state
  const [kagentiStatus, setKagentiStatus] = useState<KagentiProviderStatus | null>(null)
  const [kagentiAgents, setKagentiAgents] = useState<KagentiProviderAgent[]>([])
  const [selectedKagentiAgent, setSelectedKagentiAgent] = useState<KagentiProviderAgent | null>(null)

  const [preferredBackend, setPreferredBackendState] = useState<AgentBackendType>(() => {
    const saved = localStorage.getItem(BACKEND_PREF_KEY)
    if (saved === 'kagent' || saved === 'kagenti') return saved
    return 'kc-agent'
  })

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const refreshInFlightRef = useRef(false)
  const selectedKagentRef = useRef(selectedKagentAgent)
  const selectedKagentiRef = useRef(selectedKagentiAgent)
  useEffect(() => {
    selectedKagentRef.current = selectedKagentAgent
    selectedKagentiRef.current = selectedKagentiAgent
  }, [selectedKagentAgent, selectedKagentiAgent])

  const refresh = useCallback(async () => {
    // Guard against overlapping fetches on slow networks
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    try {
      // Poll kagent and kagenti concurrently — independent fetch chains
      // should not block each other
      const [kStatus, kiStatus] = await Promise.all([
        fetchKagentStatus(),
        fetchKagentiProviderStatus(),
      ])

      setKagentStatus(kStatus)
      setKagentiStatus(kiStatus)

      // Fetch agent lists concurrently for available backends
      const [kagentAgentsList, kagentiAgentsList] = await Promise.all([
        kStatus.available ? fetchKagentAgents() : Promise.resolve([] as KagentAgent[]),
        kiStatus.available ? fetchKagentiProviderAgents() : Promise.resolve([] as KagentiProviderAgent[]),
      ])

      // Update kagent agents
      setKagentAgents(kagentAgentsList)
      if (kStatus.available) {
        const savedName = localStorage.getItem(KAGENT_SELECTED_AGENT_KEY)
        if (savedName && !selectedKagentRef.current) {
          const found = kagentAgentsList.find(a => `${a.namespace}/${a.name}` === savedName)
          if (found) setSelectedKagentAgent(found)
        }
      }

      // Update kagenti agents
      setKagentiAgents(kagentiAgentsList)
      if (kiStatus.available) {
        const savedName = localStorage.getItem(KAGENTI_SELECTED_AGENT_KEY)
        if (savedName && !selectedKagentiRef.current) {
          const found = kagentiAgentsList.find(a => `${a.namespace}/${a.name}` === savedName)
          if (found) setSelectedKagentiAgent(found)
        }
      }
    } finally {
      refreshInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [refresh])

  const selectKagentAgent = (agent: KagentAgent) => {
    setSelectedKagentAgent(agent)
    localStorage.setItem(KAGENT_SELECTED_AGENT_KEY, `${agent.namespace}/${agent.name}`)
  }

  const selectKagentiAgent = (agent: KagentiProviderAgent) => {
    setSelectedKagentiAgent(agent)
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, `${agent.namespace}/${agent.name}`)
  }

  const setPreferredBackend = (backend: AgentBackendType) => {
    setPreferredBackendState(backend)
    localStorage.setItem(BACKEND_PREF_KEY, backend)
  }

  const kagentAvailable = kagentStatus?.available ?? false
  const kagentiAvailable = kagentiStatus?.available ?? false

  const activeBackend: AgentBackendType =
    preferredBackend === 'kagenti' && kagentiAvailable ? 'kagenti' :
    preferredBackend === 'kagent' && kagentAvailable ? 'kagent' :
    'kc-agent'

  return {
    kagentAvailable,
    kagentStatus,
    kagentAgents,
    selectedKagentAgent,
    selectKagentAgent,
    kagentiAvailable,
    kagentiStatus,
    kagentiAgents,
    selectedKagentiAgent,
    selectKagentiAgent,
    preferredBackend,
    setPreferredBackend,
    activeBackend,
    refresh }
}
