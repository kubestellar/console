import { useState, useEffect, useCallback } from 'react'

const DEMO_MODE_KEY = 'kkc-demo-mode'
const GPU_CACHE_KEY = 'kubestellar-gpu-cache'

// Global state for demo mode to ensure consistency across components
let globalDemoMode = false
const listeners = new Set<(value: boolean) => void>()

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(DEMO_MODE_KEY)
  globalDemoMode = stored === 'true'

  // Clear any stale demo GPU data if demo mode is off
  // This handles the case where demo data was incorrectly cached
  if (!globalDemoMode) {
    try {
      const gpuCache = localStorage.getItem(GPU_CACHE_KEY)
      if (gpuCache) {
        const parsed = JSON.parse(gpuCache)
        // Check if cached data looks like demo data (has demo cluster names)
        const demoClusterNames = ['vllm-gpu-cluster', 'eks-prod-us-east-1', 'gke-staging', 'aks-dev-westeu', 'openshift-prod', 'oci-oke-phoenix', 'alibaba-ack-shanghai', 'rancher-mgmt']
        const hasDemoData = parsed.nodes?.some((node: { cluster: string }) =>
          demoClusterNames.includes(node.cluster)
        )
        if (hasDemoData) {
          localStorage.removeItem(GPU_CACHE_KEY)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
}

function notifyListeners() {
  listeners.forEach(listener => listener(globalDemoMode))
}

/**
 * Hook to manage demo mode state with localStorage persistence.
 * When demo mode is enabled, the app shows demo/mock data instead of
 * connecting to the real MCP agent.
 */
export function useDemoMode() {
  const [isDemoMode, setIsDemoMode] = useState(globalDemoMode)

  useEffect(() => {
    // Subscribe to changes
    const handleChange = (value: boolean) => {
      setIsDemoMode(value)
    }
    listeners.add(handleChange)

    // Sync with current global state
    setIsDemoMode(globalDemoMode)

    return () => {
      listeners.delete(handleChange)
    }
  }, [])

  const toggleDemoMode = useCallback(() => {
    globalDemoMode = !globalDemoMode
    localStorage.setItem(DEMO_MODE_KEY, String(globalDemoMode))
    // Clear GPU cache when turning off demo mode to prevent stale demo data
    if (!globalDemoMode) {
      localStorage.removeItem(GPU_CACHE_KEY)
    }
    notifyListeners()
  }, [])

  const setDemoMode = useCallback((value: boolean) => {
    globalDemoMode = value
    localStorage.setItem(DEMO_MODE_KEY, String(value))
    // Clear GPU cache when turning off demo mode to prevent stale demo data
    if (!value) {
      localStorage.removeItem(GPU_CACHE_KEY)
    }
    notifyListeners()
  }, [])

  return {
    isDemoMode,
    toggleDemoMode,
    setDemoMode,
  }
}

/**
 * Get current demo mode state without subscribing to changes.
 * Useful for one-time checks in non-React code.
 */
export function getDemoMode(): boolean {
  return globalDemoMode
}
