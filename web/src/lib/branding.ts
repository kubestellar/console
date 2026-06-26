/**
 * White-Label Branding Configuration
 *
 * Defines the customizable branding aspects of the console.
 * All values default to KubeStellar branding — zero-config deployments
 * look identical to the current KubeStellar Console.
 *
 * Values are loaded at runtime from the /health endpoint (set via env vars
 * on the backend), NOT baked into the build.
 */

export interface BrandingConfig {
  /** Full application name (e.g., "KubeStellar Console") */
  appName: string
  /** Short name for compact UI (e.g., "KubeStellar") */
  appShortName: string
  /** Tagline shown on login/splash screens */
  tagline: string

  /** Path to logo image (relative to public root or absolute URL) */
  logoUrl: string
  /** Path to favicon */
  faviconUrl: string
  /** PWA theme color */
  themeColor: string
  /** Show sparkle/star decoration on logo (KubeStellar-specific) */
  showStarDecoration: boolean

  /** Documentation URL */
  docsUrl: string
  /** Community/support URL */
  communityUrl: string
  /** Project website URL */
  websiteUrl: string
  /** Bug report / issue URL */
  issuesUrl: string
  /** Source code repository URL */
  repoUrl: string
  /** One-line install command shown in demo-to-local CTA */
  installCommand: string

  /** Domain where hosted/demo mode is active (e.g., "console.kubestellar.io") */
  hostedDomain: string

  /** GA4 Measurement ID (empty = disabled) */
  ga4MeasurementId: string
  /** Umami Website ID (empty = disabled) */
  umamiWebsiteId: string

  /** Feature flags for KubeStellar-specific UI elements */
  showAdopterNudge: boolean
  showDemoToLocalCTA: boolean
  showRewards: boolean
  showLinkedInShare: boolean
}

/** Default branding — KubeStellar values. Used when no branding config is provided. */
export const DEFAULT_BRANDING: BrandingConfig = {
  appName: 'KubeStellar Console',
  appShortName: 'KubeStellar',
  tagline: 'multi-cluster first, saving time and tokens',

  logoUrl: '/kubestellar-logo.svg',
  faviconUrl: '/favicon.ico',
  themeColor: '#7c3aed',
  showStarDecoration: true,

  docsUrl: 'https://kubestellar.io/docs/console/readme',
  communityUrl: 'https://kubestellar.io/community',
  websiteUrl: 'https://kubestellar.io',
  issuesUrl: 'https://github.com/kubestellar/kubestellar/issues/new',
  repoUrl: 'https://github.com/kubestellar/console',
  installCommand: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/refs/heads/main/start.sh | bash',

  hostedDomain: 'console.kubestellar.io',

  ga4MeasurementId: '',
  umamiWebsiteId: '',

  showAdopterNudge: true,
  showDemoToLocalCTA: true,
  showRewards: true,
  showLinkedInShare: true,
}

/**
 * Merge a partial branding response from /health with defaults.
 * Only non-empty string values override defaults.
 */
export function mergeBranding(partial: Partial<Record<string, unknown>>): BrandingConfig {
  const result = { ...DEFAULT_BRANDING }
  for (const [key, value] of Object.entries(partial)) {
    if (key in result && value !== undefined && value !== null && value !== '') {
      // Only accept values matching the expected type of the default
      const expectedType = typeof result[key as keyof BrandingConfig]
      if (typeof value === expectedType) {
        (result as Record<string, unknown>)[key] = value
      }
    }
  }
  return result
}
