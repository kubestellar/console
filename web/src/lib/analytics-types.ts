/**
 * analytics-types.ts
 *
 * Shared types, interfaces, and constants used across all analytics modules.
 */

// ── Deployment ─────────────────────────────────────────────────────

export type DeploymentType =
  | 'localhost'
  | 'containerized'
  | 'console.kubestellar.io'
  | 'netlify-preview'
  | 'unknown'

// ── Install Copy Source ────────────────────────────────────────────

/** Source labels for install command copy events */
export type InstallCopySource =
  | 'setup_quickstart'
  | 'setup_dev_mode'
  | 'setup_k8s_deploy'
  | 'setup_oauth_env'
  | 'setup_oauth_restart'
  | 'agent_install_banner'
  | 'demo_to_local'
  | 'from_lens'
  | 'from_headlamp'
  | 'from_holmesgpt'
  | 'feature_inspektorgadget'
  | 'white_label'

// ── UTM ───────────────────────────────────────────────────────────

export interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

// ── Agent Provider ─────────────────────────────────────────────────

export interface ProviderSummary {
  name: string
  displayName: string
  capabilities: number
}

/** Capability bitmask values matching Go ProviderCapability constants */
export const CAPABILITY_CHAT = 1
export const CAPABILITY_TOOL_EXEC = 2

// ── Send options ───────────────────────────────────────────────────

export interface SendOptions {
  /**
   * Bypass the analytics opt-out gate. Reserved for voluntary, user-initiated
   * feedback events (e.g. NPS survey submissions) where the user explicitly
   * clicks to send the data. Passive tracking must never set this.
   */
  bypassOptOut?: boolean
}

// ── Window globals ─────────────────────────────────────────────────

// Extend window for gtag + Umami globals
declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
    google_tag_manager: unknown // Defined by gtag.js when it initializes
    umami?: {
      track: (eventName: string, data?: Record<string, string | number | boolean>) => void
    }
  }
}
