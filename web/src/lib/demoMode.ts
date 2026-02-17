/**
 * Unified Demo Mode Utility
 *
 * This is the single source of truth for all demo mode checks in the application.
 * All code should import from this module instead of checking tokens, environment
 * variables, or other conditions directly.
 *
 * Demo mode is enabled when ANY of these conditions are true (in priority order):
 * 1. Running on Netlify (console.kubestellar.io, deploy previews) - FORCED, cannot toggle off
 * 2. User explicitly enabled via toggle (localStorage 'kc-demo-mode' === 'true')
 * 3. Using demo token (!token || token === 'demo-token') AND user hasn't explicitly disabled
 *
 * Usage:
 * - React components: use useDemoMode() hook from '../hooks/useDemoMode'
 * - Non-React code: use isDemoMode() from this module
 * - Cache hooks: use enabled: !isDemoMode() pattern
 */

import { clearAllRegisteredCaches } from './modeTransition'
import { STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, STORAGE_KEY_DEMO_MODE } from './constants'

const DEMO_MODE_KEY = STORAGE_KEY_DEMO_MODE
const DEMO_TOKEN = DEMO_TOKEN_VALUE
const GPU_CACHE_KEY = 'kubestellar-gpu-cache'

// ============================================================================
// Environment Detection (computed once at module load, never changes)
// ============================================================================

/**
 * Whether running on a Netlify deployment (console.kubestellar.io, preview deploys).
 * These environments have no backend/agent access, so demo mode is forced.
 */
export const isNetlifyDeployment = typeof window !== 'undefined' && (
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('deploy-preview-') ||
  window.location.hostname === 'console.kubestellar.io'
)

/**
 * Whether demo mode is forced ON and cannot be toggled off.
 * True on Netlify deployments.
 * @deprecated Use isNetlifyDeployment instead for clarity
 */
export const isDemoModeForced = isNetlifyDeployment

/**
 * Whether the user can toggle demo mode on/off.
 * False on Netlify deployments (demo mode is forced).
 */
export function canToggleDemoMode(): boolean {
  return !isNetlifyDeployment
}

// ============================================================================
// State Management (global singleton with subscribers)
// ============================================================================

let globalDemoMode = false
const listeners = new Set<(value: boolean) => void>()

// Initialize from localStorage or environment
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(DEMO_MODE_KEY)
  const hasDemoToken = localStorage.getItem(STORAGE_KEY_TOKEN) === DEMO_TOKEN
  const userExplicitlyDisabled = stored === 'false'

  // Priority: Netlify > explicit preference > demo token fallback
  globalDemoMode = isNetlifyDeployment ||
                   stored === 'true' ||
                   (hasDemoToken && !userExplicitlyDisabled)

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
  // Dispatch custom event so non-React subscribers can react
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kc-demo-mode-change', { detail: globalDemoMode }))
  }
}

// ============================================================================
// Public API - Demo Mode State
// ============================================================================

/**
 * Get current demo mode state (synchronous).
 * Use this in non-React code or when you just need a one-time check.
 *
 * For React components, prefer useDemoMode() hook for automatic re-renders.
 */
export function isDemoMode(): boolean {
  return globalDemoMode
}

/**
 * Set demo mode state. Respects forced demo mode on Netlify.
 * Notifies all subscribers (React hooks, event listeners).
 *
 * @param value - Whether to enable demo mode
 * @param userInitiated - If true, this is a manual toggle (allows turning off). If false, this is automatic.
 */
export function setDemoMode(value: boolean, userInitiated = false): void {
  // Never allow disabling on Netlify
  if (isNetlifyDeployment && !value) return
  // Don't auto-disable if user explicitly enabled demo mode (only allow manual toggles)
  if (!value && !userInitiated && localStorage.getItem(DEMO_MODE_KEY) === 'true') return
  if (globalDemoMode === value) return

  globalDemoMode = value
  localStorage.setItem(DEMO_MODE_KEY, String(value))
  notifyListeners()
}

/**
 * Toggle demo mode. No-op if demo mode is forced (Netlify).
 * This is a user-initiated action, so it can turn off demo mode.
 *
 * Clears all registered caches BEFORE toggling, which:
 * 1. Sets isLoading: true on all caches
 * 2. Triggers skeleton loading states in all cards simultaneously
 * 3. Cards then fetch appropriate data (demo or live) based on new mode
 */
export function toggleDemoMode(): void {
  if (isNetlifyDeployment && globalDemoMode) return

  // Clear all caches FIRST - this sets isLoading: true, showing skeletons
  clearAllRegisteredCaches()

  // Then toggle demo mode - this triggers data fetching
  setDemoMode(!globalDemoMode, true) // userInitiated=true allows turning off
}

/**
 * Subscribe to demo mode changes.
 * Returns unsubscribe function.
 *
 * Used internally by useDemoMode() hook.
 */
export function subscribeDemoMode(callback: (value: boolean) => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

// ============================================================================
// Token Helpers - Consolidated demo-token checks
// ============================================================================

/**
 * Check if the current token is a demo token or missing.
 * This is THE canonical way to check for demo token.
 *
 * Replaces all `!token || token === 'demo-token'` patterns.
 */
export function isDemoToken(): boolean {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return !token || token === DEMO_TOKEN
}

/**
 * Check if we have a real (non-demo) authentication token.
 */
export function hasRealToken(): boolean {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return !!token && token !== DEMO_TOKEN
}

/**
 * Set the demo token (used when falling back to demo mode).
 */
export function setDemoToken(): void {
  localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN)
}

// ============================================================================
// Legacy Exports - For backwards compatibility during migration
// ============================================================================

/**
 * @deprecated Use isDemoMode() instead
 */
export const getDemoMode = isDemoMode

/**
 * @deprecated Use setDemoMode() instead
 */
export const setGlobalDemoMode = setDemoMode
