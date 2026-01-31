import { useState, useEffect, useCallback } from 'react'

const DEMO_MODE_KEY = 'kc-demo-mode'
const GPU_CACHE_KEY = 'kubestellar-gpu-cache'

// Global state for demo mode to ensure consistency across components
let globalDemoMode = false
const listeners = new Set<(value: boolean) => void>()

// Auto-enable demo mode on Netlify builds (VITE_DEMO_MODE=true in netlify.toml)
const isNetlifyPreview = typeof window !== 'undefined' && (
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('deploy-preview-') ||
  window.location.hostname === 'console.kubestellar.io'
)

/**
 * Whether demo mode is forced on and cannot be toggled off.
 * True on Netlify deployments (console.kubestellar.io, preview deploys).
 */
export const isDemoModeForced = isNetlifyPreview

// Initialize from localStorage, auto-enable on Netlify previews, or when auth
// has set a demo-token (backend unavailable / no real JWT).
// IMPORTANT: If the user has explicitly toggled demo mode off (stored === 'false'),
// respect that choice — don't let a stale demo-token override it.
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(DEMO_MODE_KEY)
  const hasDemoToken = localStorage.getItem('token') === 'demo-token'
  const userExplicitlyDisabled = stored === 'false'
  globalDemoMode = isNetlifyPreview || stored === 'true' || (hasDemoToken && !userExplicitlyDisabled)

  // Clear any stale demo GPU data if demo mode is off
  if (!globalDemoMode) {
    try {
      const gpuCache = localStorage.getItem(GPU_CACHE_KEY)
      if (gpuCache) {
        const parsed = JSON.parse(gpuCache)
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

  // Cross-tab sync: when another tab changes demo mode, update this tab
  window.addEventListener('storage', (e) => {
    if (e.key === DEMO_MODE_KEY) {
      const newValue = e.newValue === 'true'
      if (globalDemoMode !== newValue) {
        globalDemoMode = newValue
        notifyListeners()
      }
    }
  })
}

function notifyListeners() {
  listeners.forEach(listener => listener(globalDemoMode))
  // Dispatch custom event so non-React subscribers (e.g. useActiveUsers) can react
  window.dispatchEvent(new CustomEvent('kc-demo-mode-change', { detail: globalDemoMode }))
}

/**
 * Hook to manage demo mode state with localStorage persistence.
 * When demo mode is enabled, the app shows demo/mock data instead of
 * connecting to the real MCP agent.
 */
export function useDemoMode() {
  const [isDemoMode, setIsDemoMode] = useState(globalDemoMode)

  useEffect(() => {
    const handleChange = (value: boolean) => {
      setIsDemoMode(value)
    }
    listeners.add(handleChange)
    setIsDemoMode(globalDemoMode)

    return () => {
      listeners.delete(handleChange)
    }
  }, [])

  const toggleDemoMode = useCallback(() => {
    // Never allow disabling demo mode on Netlify deployments
    if (isNetlifyPreview && globalDemoMode) return
    globalDemoMode = !globalDemoMode
    localStorage.setItem(DEMO_MODE_KEY, String(globalDemoMode))
    notifyListeners()
  }, [])

  const setDemoMode = useCallback((value: boolean) => {
    // Never allow disabling demo mode on Netlify deployments
    if (isNetlifyPreview && !value) return
    globalDemoMode = value
    localStorage.setItem(DEMO_MODE_KEY, String(value))
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

/**
 * Set global demo mode from non-React code (e.g., when agent provides real data).
 * Notifies all subscribed components so they re-render.
 * Will NOT auto-disable demo mode if the user explicitly toggled it ON.
 */
export function setGlobalDemoMode(value: boolean) {
  // Never allow disabling demo mode on Netlify deployments
  if (isNetlifyPreview && !value) return
  // Don't auto-disable if user explicitly enabled demo mode.
  // Read localStorage directly — survives module reloads, no stale variable.
  if (!value && localStorage.getItem(DEMO_MODE_KEY) === 'true') return
  if (globalDemoMode === value) return // no-op
  globalDemoMode = value
  localStorage.setItem(DEMO_MODE_KEY, String(value))
  notifyListeners()
}
