import { useState, useEffect, useCallback } from 'react'

const DEMO_MODE_KEY = 'ksc-demo-mode'
const GPU_CACHE_KEY = 'kubestellar-gpu-cache'

// Global state for demo mode to ensure consistency across components
let globalDemoMode = false
const listeners = new Set<(value: boolean) => void>()

// Auto-enable demo mode on Netlify preview builds (VITE_DEMO_MODE=true in netlify.toml)
const isNetlifyPreview = typeof window !== 'undefined' && (
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('deploy-preview-')
)

// Initialize from localStorage, or auto-enable on Netlify previews
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(DEMO_MODE_KEY)
  globalDemoMode = isNetlifyPreview || stored === 'true'

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
    // NOTE: We no longer clear GPU cache here - the fetch logic handles
    // transitioning from demo to real data, and clearing here causes
    // loss of GPU data if the subsequent fetch fails.
    notifyListeners()
  }, [])

  const setDemoMode = useCallback((value: boolean) => {
    globalDemoMode = value
    localStorage.setItem(DEMO_MODE_KEY, String(value))
    // NOTE: We no longer clear GPU cache here - the fetch logic handles
    // transitioning from demo to real data, and clearing here causes
    // loss of GPU data if the subsequent fetch fails.
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
