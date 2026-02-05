/**
 * Stack Context
 *
 * Provides llm-d stack selection and discovery state to the AI/ML dashboard.
 * Persists selection to localStorage for session continuity.
 */
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useStackDiscovery, type LLMdStack } from '../hooks/useStackDiscovery'

const STORAGE_KEY = 'kubestellar-llmd-stack'

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
  const { stacks, isLoading, error, refetch, lastRefresh } = useStackDiscovery(clusters)
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
