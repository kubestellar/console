/**
 * Application route constants
 * 
 * Centralized route definitions for type-safety and maintainability.
 * Use these constants instead of hardcoding route paths throughout the app.
 */

export const ROUTES = {
  // Auth routes
  LOGIN: '/login',
  AUTH_CALLBACK: '/auth/callback',
  ONBOARDING: '/onboarding',
  
  // Main routes
  HOME: '/',
  CUSTOM_DASHBOARD: '/custom-dashboard/:id',
  
  // Settings & Management
  SETTINGS: '/settings',
  USERS: '/users',
  
  // Core Resources
  CLUSTERS: '/clusters',
  NODES: '/nodes',
  NAMESPACES: '/namespaces',
  DEPLOYMENTS: '/deployments',
  PODS: '/pods',
  SERVICES: '/services',
  
  // Workloads & Operations
  WORKLOADS: '/workloads',
  OPERATORS: '/operators',
  HELM: '/helm',
  LOGS: '/logs',
  EVENTS: '/events',
  
  // Infrastructure
  COMPUTE: '/compute',
  COMPUTE_COMPARE: '/compute/compare',
  STORAGE: '/storage',
  NETWORK: '/network',
  
  // Monitoring & Observability
  ALERTS: '/alerts',
  HISTORY: '/history',
  
  // Security & Compliance
  SECURITY: '/security',
  SECURITY_POSTURE: '/security-posture',
  COMPLIANCE: '/compliance',
  DATA_COMPLIANCE: '/data-compliance',
  
  // Advanced Features
  GITOPS: '/gitops',
  COST: '/cost',
  GPU_RESERVATIONS: '/gpu-reservations',
  ARCADE: '/arcade',
  DEPLOY: '/deploy',
  AI_ML: '/ai-ml',
  CI_CD: '/ci-cd',
  
  // Widget
  WIDGET: '/widget',
} as const

/**
 * Helper function to create a custom dashboard route with ID
 */
export function getCustomDashboardRoute(id: string): string {
  return ROUTES.CUSTOM_DASHBOARD.replace(':id', id)
}

/**
 * Helper function to create a login route with error parameter
 */
export function getLoginWithError(error: string): string {
  return `${ROUTES.LOGIN}?error=${encodeURIComponent(error)}`
}

/**
 * Helper function to create a settings route with hash
 */
export function getSettingsWithHash(hash: string): string {
  return `${ROUTES.SETTINGS}#${hash}`
}
