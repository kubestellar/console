/**
 * Route-to-title map for GA4 page view granularity and browser tab labeling.
 * Keys use ROUTES constants so renames stay in sync automatically.
 *
 * Extracted from App.tsx to keep route metadata separate from routing logic.
 */
import { ROUTES } from '../config/routes'

export const ROUTE_TITLES: Record<string, string> = {
  [ROUTES.HOME]:                    'Dashboard',
  [ROUTES.CLUSTERS]:                'My Clusters',
  [ROUTES.CLUSTER_ADMIN]:           'Cluster Admin',
  [ROUTES.NODES]:                   'Nodes',
  [ROUTES.NAMESPACES]:              'Namespaces',
  [ROUTES.DEPLOYMENTS]:             'Deployments',
  [ROUTES.PODS]:                    'Pods',
  [ROUTES.SERVICES]:                'Services',
  [ROUTES.WORKLOADS]:               'Workloads',
  [ROUTES.OPERATORS]:               'Operators',
  [ROUTES.HELM]:                    'Helm',
  [ROUTES.LOGS]:                    'Logs',
  [ROUTES.EVENTS]:                  'Events',
  [ROUTES.COMPUTE]:                 'Compute',
  [ROUTES.COMPUTE_COMPARE]:         'Cluster Comparison',
  [ROUTES.STORAGE]:                 'Storage',
  [ROUTES.NETWORK]:                 'Network',
  [ROUTES.ALERTS]:                  'Alerts',
  [ROUTES.SECURITY]:                'Security',
  [ROUTES.SECURITY_POSTURE]:        'Security Posture',
  [ROUTES.COMPLIANCE]:              'Compliance',
  [ROUTES.COMPLIANCE_FRAMEWORKS]:   'Compliance Frameworks',
  [ROUTES.CHANGE_CONTROL]:          'Change Control',
  [ROUTES.SEGREGATION_OF_DUTIES]:   'Segregation of Duties',
  [ROUTES.COMPLIANCE_REPORTS]:      'Compliance Reports',
  [ROUTES.DATA_RESIDENCY]:          'Data Residency',
  [ROUTES.BAA]:                     'BAA Tracker',
  [ROUTES.HIPAA]:                   'HIPAA Compliance',
  [ROUTES.GXP]:                     'GxP Validation',
  [ROUTES.NIST]:                    'NIST 800-53',
  [ROUTES.STIG]:                    'DISA STIG',
  [ROUTES.AIR_GAP]:                 'Air-Gap Readiness',
  [ROUTES.FEDRAMP]:                 'FedRAMP Readiness',
  [ROUTES.ENTERPRISE]:              'Enterprise Compliance',
  [ROUTES.ENTERPRISE_OIDC]:               'OIDC Federation',
  [ROUTES.ENTERPRISE_RBAC_AUDIT]:         'RBAC Audit',
  [ROUTES.ENTERPRISE_SESSIONS]:           'Session Management',
  [ROUTES.ENTERPRISE_SIEM]:               'SIEM Integration',
  [ROUTES.ENTERPRISE_INCIDENT_RESPONSE]:  'Incident Response',
  [ROUTES.ENTERPRISE_THREAT_INTEL]:       'Threat Intelligence',
  [ROUTES.ENTERPRISE_SBOM]:               'SBOM Manager',
  [ROUTES.ENTERPRISE_SIGSTORE]:           'Sigstore Verification',
  [ROUTES.ENTERPRISE_SLSA]:               'SLSA Provenance',
  [ROUTES.ENTERPRISE_RISK_MATRIX]:        'Risk Matrix',
  [ROUTES.ENTERPRISE_RISK_REGISTER]:      'Risk Register',
  [ROUTES.ENTERPRISE_RISK_APPETITE]:      'Risk Appetite',
  [ROUTES.DATA_COMPLIANCE]:         'Data Compliance',
  [ROUTES.GITOPS]:                  'GitOps',
  [ROUTES.COST]:                    'Cost',
  [ROUTES.GPU_RESERVATIONS]:        'GPU Reservations',
  [ROUTES.DEPLOY]:                  'Deploy',
  [ROUTES.AI_ML]:                   'AI/ML',
  [ROUTES.AI_AGENTS]:               'AI Agents',
  [ROUTES.CI_CD]:                   'CI/CD',
  [ROUTES.KARMADA_OPS]:             'Karmada Ops',
  [ROUTES.LLM_D_BENCHMARKS]:        'llm-d Benchmarks',
  [ROUTES.MULTI_TENANCY]:           'Multi-Tenancy',
  [ROUTES.DRASI]:                   'Drasi',
  [ROUTES.ACMM]:                    'AI Codebase Maturity',
  [ROUTES.ARCADE]:                  'Arcade',
  [ROUTES.MARKETPLACE]:             'Marketplace',
  [ROUTES.MISSIONS]:                'Missions',
  [ROUTES.HISTORY]:                 'Card History',
  [ROUTES.SETTINGS]:                'Settings',
  [ROUTES.USERS]:                   'User Management',
  [ROUTES.LOGIN]:                   'Login',
  [ROUTES.FROM_LENS]:               'Switching from Lens',
  [ROUTES.FROM_HEADLAMP]:           'Coming from Headlamp',
  [ROUTES.FROM_HOLMESGPT]:          'Coming from HolmesGPT',
  [ROUTES.FEATURE_INSPEKTORGADGET]: 'Inspektor Gadget Integration',
  [ROUTES.FEATURE_KAGENT]:          'Kagent Integration',
  [ROUTES.WHITE_LABEL]:             'White-Label Your Console',
  [ROUTES.EMBED_BASE]:              'Embed Card',
  [ROUTES.INSIGHTS]:                'Insights',
}

/** Map route paths to dashboard IDs for duration analytics */
export function pathToDashboardId(path?: string | null): string | null {
  if (!path) return null
  if (path === ROUTES.HOME) return 'main'
  const customPrefix = ROUTES.CUSTOM_DASHBOARD.replace(':id', '')
  if (path.startsWith(customPrefix)) return path.replace(customPrefix, 'custom-')
  const id = path.replace(/^\//, '')
  return id || null
}
