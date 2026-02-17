/**
 * External API Configuration
 *
 * This file centralizes external API endpoints and documentation URLs.
 *
 * SECURITY NOTE: All URLs in this file are intentionally hardcoded and safe:
 * - Documentation links to official public resources (not credentials)
 * - Public API endpoints with environment variable overrides where needed
 * - Installation commands referencing public GitHub releases
 *
 * This is NOT a security vulnerability - these are public URLs required for
 * application functionality and user guidance.
 */

import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'

/**
 * Weather and Geocoding APIs
 * 
 * SECURITY: Safe - Public API with environment variable override
 */
export const WEATHER_API = {
  // Open-Meteo Geocoding API - Free public API for location search (no authentication required)
  // Can be overridden via VITE_GEOCODING_API_URL environment variable
  // This is a public endpoint and does NOT contain credentials
  geocodingUrl: import.meta.env.VITE_GEOCODING_API_URL || 'https://geocoding-api.open-meteo.com/v1/search',
} as const

/**
 * AI Provider Documentation URLs
 * 
 * SECURITY: Safe - These are public documentation links (not credentials)
 * These URLs guide users to obtain their own API keys and are part of
 * the application's help/documentation system.
 */
export const AI_PROVIDER_DOCS = {
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://makersuite.google.com/app/apikey',
} as const

/**
 * Kubernetes and Service Mesh Documentation URLs
 * 
 * SECURITY: Safe - Official public documentation and installation commands
 * These are hardcoded references to official Kubernetes documentation and
 * public GitHub repositories. They are essential for user guidance and
 * contain no credentials or sensitive information.
 */
export const K8S_DOCS = {
  // Official Kubernetes Gateway API documentation (public)
  gatewayApi: 'https://gateway-api.sigs.k8s.io/',
  gatewayApiGettingStarted: 'https://gateway-api.sigs.k8s.io/guides/getting-started/',
  gatewayApiImplementations: 'https://gateway-api.sigs.k8s.io/implementations/',
  gammaInitiative: 'https://gateway-api.sigs.k8s.io/concepts/gamma/',

  // Official MCS API documentation (public GitHub repository)
  mcsApi: 'https://github.com/kubernetes-sigs/mcs-api',
  mcsApiServiceImport: 'https://github.com/kubernetes-sigs/mcs-api#serviceimport',
  mcsApiInstall: 'https://github.com/kubernetes-sigs/mcs-api#installing-the-crds',

  // Installation commands using public GitHub releases (no credentials required)
  gatewayApiInstallCommand: 'kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml',
  mcsApiInstallCommand: 'kubectl apply -f https://github.com/kubernetes-sigs/mcs-api/releases/latest/download/mcs-api-crds.yaml',
} as const

/**
 * KC Agent Configuration
 * Local agent URL for API key management
 */
export const KC_AGENT = {
  url: LOCAL_AGENT_HTTP_URL,
  installCommand: 'brew install kubestellar/tap/kc-agent && kc-agent',
} as const
