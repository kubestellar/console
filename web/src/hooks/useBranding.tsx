/**
 * Branding Context Provider
 *
 * Fetches branding configuration from the /health endpoint and provides
 * it to all components via React context. Falls back to DEFAULT_BRANDING
 * (KubeStellar values) if the endpoint is unavailable or returns no branding.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { DEFAULT_BRANDING, mergeBranding, type BrandingConfig } from '../lib/branding'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { updateAnalyticsIds } from '../lib/analytics'

const BrandingContext = createContext<BrandingConfig>(DEFAULT_BRANDING)

/** Access the current branding configuration */
export function useBranding(): BrandingConfig {
  return useContext(BrandingContext)
}

interface BrandingProviderProps {
  children: ReactNode
}

/**
 * Wraps the app to provide branding context.
 * Fetches branding from /health on mount; renders children immediately
 * with defaults (no loading state — branding is progressive enhancement).
 */
export function BrandingProvider({ children }: BrandingProviderProps) {
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING)

  useEffect(() => {
    let cancelled = false

    async function fetchBranding() {
      try {
        const resp = await fetch('/health', {
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        const data = await resp.json()
        if (!cancelled && data.branding && typeof data.branding === 'object') {
          const merged = mergeBranding(data.branding)
          setBranding(merged)
          // Override analytics IDs if branding provides them
          updateAnalyticsIds({
            ga4MeasurementId: merged.ga4MeasurementId,
            umamiWebsiteId: merged.umamiWebsiteId,
          })
        }
      } catch {
        // Use defaults — branding is non-critical
      }
    }

    fetchBranding()
    return () => { cancelled = true }
  }, [])

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  )
}
