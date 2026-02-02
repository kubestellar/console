/**
 * External API Configuration
 * 
 * This file centralizes external API endpoints and documentation URLs.
 * Some URLs (like documentation links) are intentionally hardcoded as they
 * are part of the application's functionality and reference public resources.
 */

/**
 * Weather and Geocoding APIs
 */
export const WEATHER_API = {
  // Open-Meteo Geocoding API - Free public API for location search
  // Can be overridden via VITE_GEOCODING_API_URL environment variable
  geocodingUrl: import.meta.env.VITE_GEOCODING_API_URL || 'https://geocoding-api.open-meteo.com/v1/search',
} as const

/**
 * AI Provider Documentation URLs
 * These are hardcoded as they are public documentation links
 * that guide users to obtain API keys.
 */
export const AI_PROVIDER_DOCS = {
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://makersuite.google.com/app/apikey',
} as const

/**
 * Kubernetes and Service Mesh Documentation URLs
 * These are hardcoded references to official documentation and
 * are essential for user guidance within the application.
 */
export const K8S_DOCS = {
  gatewayApi: 'https://gateway-api.sigs.k8s.io/',
  gatewayApiGettingStarted: 'https://gateway-api.sigs.k8s.io/guides/getting-started/',
  gatewayApiImplementations: 'https://gateway-api.sigs.k8s.io/implementations/',
  gammaInitiative: 'https://gateway-api.sigs.k8s.io/concepts/gamma/',
  mcsApi: 'https://github.com/kubernetes-sigs/mcs-api',
  mcsApiServiceImport: 'https://github.com/kubernetes-sigs/mcs-api#serviceimport',
  mcsApiInstall: 'https://github.com/kubernetes-sigs/mcs-api#installing-the-crds',
  gatewayApiInstallCommand: 'kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml',
  mcsApiInstallCommand: 'kubectl apply -f https://github.com/kubernetes-sigs/mcs-api/releases/latest/download/mcs-api-crds.yaml',
} as const

/**
 * KC Agent Configuration
 * Local agent URL for API key management
 */
export const KC_AGENT = {
  url: 'http://127.0.0.1:8585',
  installCommand: 'brew install kubestellar/tap/kc-agent && kc-agent',
} as const
