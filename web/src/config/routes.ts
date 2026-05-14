/**
 * Application route constants
 * 
 * Centralized route definitions for type-safety and maintainability.
 * Use these constants instead of hardcoding route paths throughout the app.
 * 
 * Navigation Best Practices:
 * - Always use ROUTES constants instead of hardcoding paths
 * - Use helper functions (getCustomDashboardRoute, getMissionRoute) for dynamic routes
 * - External links should use the ExternalLink component from components/ui/ExternalLink
 * - Deep navigation is handled by DrillDownProvider with automatic breadcrumbs
 * - Browser history integration is automatic for drill-down views
 */

export const ROUTES = {
  // Auth routes
  LOGIN: '/login',
  AUTH_CALLBACK: '/auth/callback',
  // Main routes
  HOME: '/',
  DASHBOARD_ALIAS: '/dashboard',
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
  COMPLIANCE_FRAMEWORKS: '/compliance-frameworks',
  CHANGE_CONTROL: '/change-control',
  SEGREGATION_OF_DUTIES: '/segregation-of-duties',
  COMPLIANCE_REPORTS: '/compliance-reports',
  DATA_RESIDENCY: '/data-residency',
  BAA: '/baa',
  HIPAA: '/hipaa',
  GXP: '/gxp',
  NIST: '/nist',
  STIG: '/stig',
  AIR_GAP: '/air-gap',
  FEDRAMP: '/fedramp',
  DATA_COMPLIANCE: '/data-compliance',
  
  // Advanced Features
  GITOPS: '/gitops',
  COST: '/cost',
  GPU_RESERVATIONS: '/gpu-reservations',
  ARCADE: '/arcade',
  DEPLOY: '/deploy',
  AI_ML: '/ai-ml',
  AI_AGENTS: '/ai-agents',
  CI_CD: '/ci-cd',
  KARMADA_OPS: '/karmada-ops',
  LLM_D_BENCHMARKS: '/llm-d-benchmarks',
  INSIGHTS: '/insights',

  // Persona dashboards
  CLUSTER_ADMIN: '/cluster-admin',

  // Quantum Computing
  QUANTUM: '/quantum',

  // Enterprise Compliance Portal
  ENTERPRISE: '/enterprise',
  ENTERPRISE_OIDC: '/enterprise/oidc',
  ENTERPRISE_RBAC_AUDIT: '/enterprise/rbac-audit',
  ENTERPRISE_SESSIONS: '/enterprise/sessions',
  ENTERPRISE_SIEM: '/enterprise/siem',
  ENTERPRISE_INCIDENT_RESPONSE: '/enterprise/incident-response',
  ENTERPRISE_THREAT_INTEL: '/enterprise/threat-intel',
  ENTERPRISE_SBOM: '/enterprise/sbom',
  ENTERPRISE_SIGSTORE: '/enterprise/sigstore',
  ENTERPRISE_SLSA: '/enterprise/slsa',
  ENTERPRISE_RISK_MATRIX: '/enterprise/risk-matrix',
  ENTERPRISE_RISK_REGISTER: '/enterprise/risk-register',
  ENTERPRISE_RISK_APPETITE: '/enterprise/risk-appetite',

  // Marketplace
  MARKETPLACE: '/marketplace',

  // Mission deep-links
  MISSIONS: '/missions',
  MISSION: '/missions/:missionId',

  // Widget
  WIDGET: '/widget',

  // Embed (standalone card for iframe embedding)
  EMBED_BASE: '/embed',
  EMBED_CARD: '/embed/:cardType',

  // Feedback / issue shortcuts
  ISSUE: '/issue',
  ISSUES: '/issues',
  FEEDBACK: '/feedback',
  FEATURE: '/feature',
  FEATURES: '/features',

  // Marketing / competitive landing pages
  WELCOME: '/welcome',
  FROM_LENS: '/from-lens',
  FROM_HEADLAMP: '/from-headlamp',
  FROM_HOLMESGPT: '/from-holmesgpt',
  FEATURE_INSPEKTORGADGET: '/feature-inspektorgadget',
  FEATURE_KAGENT: '/feature-kagent',
  WHITE_LABEL: '/white-label',

  // Multi-Tenancy
  MULTI_TENANCY: '/multi-tenancy',

  // Drasi
  DRASI: '/drasi',

  // AI Codebase Maturity Model
  ACMM: '/acmm',

  // Dev / test routes
  TEST_UNIFIED_CARD: '/test/unified-card',
  TEST_UNIFIED_STATS: '/test/unified-stats',
  TEST_UNIFIED_DASHBOARD: '/test/unified-dashboard',
  PERF_ALL_CARDS: '/__perf/all-cards',
  PERF_COMPLIANCE: '/__compliance/all-cards',
} as const

/**
 * Helper function to create a custom dashboard route with ID
 */
export function getCustomDashboardRoute(id: string): string {
  // Encode the id so special characters like '/', '?', '#', '%' don't break
  // the URL or enable path traversal into unrelated routes.
  return ROUTES.CUSTOM_DASHBOARD.replace(':id', encodeURIComponent(id))
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

/**
 * Helper function to create a mission deep-link URL
 */
export function getMissionRoute(missionId: string): string {
  return ROUTES.MISSION.replace(':missionId', encodeURIComponent(missionId))
}

/**
 * Helper function to create the canonical missions browser route
 */
export function getHomeBrowseMissionsRoute(): string {
  return ROUTES.MISSIONS
}
