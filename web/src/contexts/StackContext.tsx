/**
 * Stack Context
 *
 * Provides llm-d stack selection and discovery state to the AI/ML dashboard.
 * Persists selection to localStorage for session continuity.
 *
 * When demo mode is enabled, provides fake demo stacks instead of live data.
 */
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useStackDiscovery, type LLMdStack, type LLMdStackComponent } from '../hooks/useStackDiscovery'
import { useDemoMode } from '../hooks/useDemoMode'

const STORAGE_KEY = 'kubestellar-llmd-stack'

// Demo stacks for when console is in demo mode
function createDemoStacks(): LLMdStack[] {
  const createComponent = (
    name: string,
    namespace: string,
    cluster: string,
    type: LLMdStackComponent['type'],
    replicas: number,
    status: LLMdStackComponent['status'] = 'running'
  ): LLMdStackComponent => ({
    name,
    namespace,
    cluster,
    type,
    status,
    replicas,
    readyReplicas: status === 'running' ? replicas : 0,
    model: 'Llama-3-70B',
  })

  return [
    // Demo disaggregated stack with WVA autoscaler (active replicas)
    {
      id: 'llm-inference@demo-cluster-1',
      name: 'llm-inference',
      namespace: 'llm-inference',
      cluster: 'demo-cluster-1',
      inferencePool: 'llm-inference-pool',
      components: {
        prefill: [
          createComponent('prefill-server-0', 'llm-inference', 'demo-cluster-1', 'prefill', 2),
          createComponent('prefill-server-1', 'llm-inference', 'demo-cluster-1', 'prefill', 2),
        ],
        decode: [
          createComponent('decode-server-0', 'llm-inference', 'demo-cluster-1', 'decode', 3),
          createComponent('decode-server-1', 'llm-inference', 'demo-cluster-1', 'decode', 3),
        ],
        both: [],
        epp: createComponent('inference-epp', 'llm-inference', 'demo-cluster-1', 'epp', 2),
        gateway: createComponent('inference-gateway', 'llm-inference', 'demo-cluster-1', 'gateway', 1),
      },
      status: 'healthy',
      hasDisaggregation: true,
      model: 'Llama-3-70B',
      totalReplicas: 12,
      readyReplicas: 12,
      autoscaler: {
        type: 'WVA',
        name: 'llm-inference-wva',
        minReplicas: 4,
        maxReplicas: 16,
        currentReplicas: 12,
        desiredReplicas: 12,
      },
    },
    // Demo WVA-managed stack scaled to 0 (shows ghost nodes)
    {
      id: 'llm-idle@demo-cluster-1',
      name: 'llm-idle',
      namespace: 'llm-idle',
      cluster: 'demo-cluster-1',
      inferencePool: 'llm-idle-pool',
      components: {
        prefill: [],
        decode: [],
        both: [],
        epp: createComponent('idle-epp', 'llm-idle', 'demo-cluster-1', 'epp', 1),
        gateway: createComponent('idle-gateway', 'llm-idle', 'demo-cluster-1', 'gateway', 1),
      },
      status: 'degraded',
      hasDisaggregation: false,
      model: 'Mistral-7B',
      totalReplicas: 0,
      readyReplicas: 0,
      autoscaler: {
        type: 'WVA',
        name: 'llm-idle-wva',
        minReplicas: 0,
        maxReplicas: 8,
        currentReplicas: 0,
        desiredReplicas: 0,
      },
    },
    // Demo unified stack with HPA autoscaler
    {
      id: 'vllm-prod@demo-cluster-2',
      name: 'vllm-prod',
      namespace: 'vllm-prod',
      cluster: 'demo-cluster-2',
      inferencePool: 'vllm-prod-pool',
      components: {
        prefill: [],
        decode: [],
        both: [
          createComponent('vllm-server-0', 'vllm-prod', 'demo-cluster-2', 'both', 4),
          createComponent('vllm-server-1', 'vllm-prod', 'demo-cluster-2', 'both', 4),
          createComponent('vllm-server-2', 'vllm-prod', 'demo-cluster-2', 'both', 4),
        ],
        epp: createComponent('vllm-epp', 'vllm-prod', 'demo-cluster-2', 'epp', 1),
        gateway: createComponent('vllm-gateway', 'vllm-prod', 'demo-cluster-2', 'gateway', 1),
      },
      status: 'healthy',
      hasDisaggregation: false,
      model: 'Granite-13B',
      totalReplicas: 14,
      readyReplicas: 14,
      autoscaler: {
        type: 'HPA',
        name: 'vllm-prod-hpa',
        minReplicas: 6,
        maxReplicas: 24,
        currentReplicas: 14,
        desiredReplicas: 14,
      },
    },
    // Demo degraded stack (no autoscaler - manual scaling)
    {
      id: 'inference-staging@demo-cluster-1',
      name: 'inference-staging',
      namespace: 'inference-staging',
      cluster: 'demo-cluster-1',
      components: {
        prefill: [
          createComponent('staging-prefill-0', 'inference-staging', 'demo-cluster-1', 'prefill', 1),
        ],
        decode: [
          createComponent('staging-decode-0', 'inference-staging', 'demo-cluster-1', 'decode', 1, 'pending'),
        ],
        both: [],
        epp: createComponent('staging-epp', 'inference-staging', 'demo-cluster-1', 'epp', 1),
        gateway: null,
      },
      status: 'degraded',
      hasDisaggregation: true,
      model: 'Qwen-32B',
      totalReplicas: 3,
      readyReplicas: 2,
      // No autoscaler - manually scaled
    },
  ]
}

interface StackContextType {
  // Discovery
  stacks: LLMdStack[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  lastRefresh: Date | null

  // Selection
  selectedStack: LLMdStack | null
  selectedStackId: string | null
  setSelectedStackId: (id: string | null) => void

  // Demo mode
  isDemoMode: boolean

  // Helpers
  getStackById: (id: string) => LLMdStack | undefined
  healthyStacks: LLMdStack[]
  disaggregatedStacks: LLMdStack[]
}

const StackContext = createContext<StackContextType | null>(null)

interface StackProviderProps {
  children: React.ReactNode
  clusters?: string[]
}

export function StackProvider({ children, clusters = ['pok-prod-001', 'vllm-d'] }: StackProviderProps) {
  const { isDemoMode } = useDemoMode()
  const { stacks: liveStacks, isLoading: liveLoading, error: liveError, refetch: liveRefetch, lastRefresh: liveLastRefresh } = useStackDiscovery(clusters)

  // Use demo stacks when in demo mode, otherwise live stacks
  const demoStacks = useMemo(() => createDemoStacks(), [])
  const stacks = isDemoMode ? demoStacks : liveStacks
  const isLoading = isDemoMode ? false : liveLoading
  const error = isDemoMode ? null : liveError
  const refetch = isDemoMode ? (() => {}) : liveRefetch
  const lastRefresh = isDemoMode ? new Date() : liveLastRefresh

  const [selectedStackId, setSelectedStackIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY)
    }
    return null
  })

  // Persist selection to localStorage
  const setSelectedStackId = useCallback((id: string | null) => {
    setSelectedStackIdState(id)
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // Auto-select first healthy stack if none selected and stacks are available
  useEffect(() => {
    if (!isLoading && stacks.length > 0 && !selectedStackId) {
      // Try to find a healthy stack with disaggregation first
      const preferredStack = stacks.find(s => s.status === 'healthy' && s.hasDisaggregation) ||
                            stacks.find(s => s.status === 'healthy') ||
                            stacks[0]
      if (preferredStack) {
        setSelectedStackId(preferredStack.id)
      }
    }
  }, [isLoading, stacks, selectedStackId, setSelectedStackId])

  // If selected stack no longer exists, clear selection
  useEffect(() => {
    if (!isLoading && selectedStackId && !stacks.find(s => s.id === selectedStackId)) {
      setSelectedStackId(null)
    }
  }, [isLoading, stacks, selectedStackId, setSelectedStackId])

  const getStackById = useCallback((id: string) => {
    return stacks.find(s => s.id === id)
  }, [stacks])

  const selectedStack = useMemo(() => {
    if (!selectedStackId) return null
    return stacks.find(s => s.id === selectedStackId) || null
  }, [stacks, selectedStackId])

  const healthyStacks = useMemo(() => {
    return stacks.filter(s => s.status === 'healthy')
  }, [stacks])

  const disaggregatedStacks = useMemo(() => {
    return stacks.filter(s => s.hasDisaggregation)
  }, [stacks])

  const value: StackContextType = {
    stacks,
    isLoading,
    error,
    refetch,
    lastRefresh,
    selectedStack,
    selectedStackId,
    setSelectedStackId,
    isDemoMode,
    getStackById,
    healthyStacks,
    disaggregatedStacks,
  }

  return (
    <StackContext.Provider value={value}>
      {children}
    </StackContext.Provider>
  )
}

export function useStack() {
  const context = useContext(StackContext)
  if (!context) {
    throw new Error('useStack must be used within a StackProvider')
  }
  return context
}

// Hook to check if we're inside a StackProvider
export function useOptionalStack(): StackContextType | null {
  return useContext(StackContext)
}
