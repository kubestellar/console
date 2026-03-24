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

  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const selectedKagentRef = useRef(selectedKagentAgent)
  const selectedKagentiRef = useRef(selectedKagentiAgent)
  useEffect(() => {
    selectedKagentRef.current = selectedKagentAgent
    selectedKagentiRef.current = selectedKagentiAgent
  }, [selectedKagentAgent, selectedKagentiAgent])

  const refresh = useCallback(async () => {
    // Poll kagent
    const kStatus = await fetchKagentStatus()
    setKagentStatus(kStatus)
    if (kStatus.available) {
      const agents = await fetchKagentAgents()
      setKagentAgents(agents)
      const savedName = localStorage.getItem(KAGENT_SELECTED_AGENT_KEY)
      if (savedName && !selectedKagentRef.current) {
        const found = agents.find(a => `${a.namespace}/${a.name}` === savedName)
        if (found) setSelectedKagentAgent(found)
      }
    } else {
      setKagentAgents([])
    }

    // Poll kagenti
    const kiStatus = await fetchKagentiProviderStatus()
    setKagentiStatus(kiStatus)
    if (kiStatus.available) {
      const agents = await fetchKagentiProviderAgents()
      setKagentiAgents(agents)
      const savedName = localStorage.getItem(KAGENTI_SELECTED_AGENT_KEY)
      if (savedName && !selectedKagentiRef.current) {
        const found = agents.find(a => `${a.namespace}/${a.name}` === savedName)
        if (found) setSelectedKagentiAgent(found)
      }
    } else {
      setKagentiAgents([])
    }
  }, [])

  useEffect(() => {
    refresh()
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [refresh])

  const selectKagentAgent = useCallback((agent: KagentAgent) => {
    setSelectedKagentAgent(agent)
    localStorage.setItem(KAGENT_SELECTED_AGENT_KEY, `${agent.namespace}/${agent.name}`)
  }, [])

  const selectKagentiAgent = useCallback((agent: KagentiProviderAgent) => {
    setSelectedKagentiAgent(agent)
    localStorage.setItem(KAGENTI_SELECTED_AGENT_KEY, `${agent.namespace}/${agent.name}`)
  }, [])

  const setPreferredBackend = useCallback((backend: AgentBackendType) => {
    setPreferredBackendState(backend)
    localStorage.setItem(BACKEND_PREF_KEY, backend)
  }, [])

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
    refresh,
  }
}
