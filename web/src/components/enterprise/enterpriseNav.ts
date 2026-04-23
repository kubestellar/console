/**
 * Enterprise Compliance Portal — Navigation Configuration
 *
 * Defines the left sidebar menu structure organized by epic.
 * Each section maps to a compliance vertical with its dashboards.
 */

export interface EnterpriseNavItem {
  id: string
  label: string
  href: string
  icon: string
  badge?: string
}

export interface EnterpriseNavSection {
  id: string
  title: string
  icon: string
  items: EnterpriseNavItem[]
}

export const ENTERPRISE_NAV_SECTIONS: EnterpriseNavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: 'LayoutDashboard',
    items: [
      { id: 'enterprise-home', label: 'Enterprise Home', href: '/enterprise', icon: 'Building2' },
    ],
  },
  {
    id: 'fintech',
    title: 'FinTech & Regulatory',
    icon: 'Landmark',
    items: [
      { id: 'compliance-frameworks', label: 'Frameworks', href: '/enterprise/frameworks', icon: 'Scale' },
      { id: 'change-control', label: 'Change Control', href: '/enterprise/change-control', icon: 'GitBranch' },
      { id: 'segregation-of-duties', label: 'Segregation of Duties', href: '/enterprise/sod', icon: 'Users' },
      { id: 'data-residency', label: 'Data Residency', href: '/enterprise/data-residency', icon: 'Globe' },
      { id: 'compliance-reports', label: 'Reports', href: '/enterprise/reports', icon: 'FileText' },
    ],
  },
  {
    id: 'healthcare',
    title: 'Healthcare & Life Sciences',
    icon: 'Heart',
    items: [
      { id: 'hipaa', label: 'HIPAA Compliance', href: '/enterprise/hipaa', icon: 'ShieldCheck' },
      { id: 'gxp', label: 'GxP Validation', href: '/enterprise/gxp', icon: 'FlaskConical' },
      { id: 'baa', label: 'BAA Tracker', href: '/enterprise/baa', icon: 'Handshake' },
    ],
  },
  {
    id: 'government',
    title: 'Government & Defense',
    icon: 'Shield',
    items: [
      { id: 'nist', label: 'NIST 800-53', href: '/enterprise/nist', icon: 'BookOpen' },
      { id: 'stig', label: 'DISA STIG', href: '/enterprise/stig', icon: 'ShieldAlert' },
      { id: 'airgap', label: 'Air-Gap Readiness', href: '/enterprise/air-gap', icon: 'WifiOff' },
      { id: 'fedramp', label: 'FedRAMP', href: '/enterprise/fedramp', icon: 'Award' },
    ],
  },
  {
    id: 'identity',
    title: 'Identity & Access',
    icon: 'KeyRound',
    items: [
      { id: 'oidc', label: 'OIDC Federation', href: '/enterprise/oidc', icon: 'Fingerprint' },
      { id: 'rbac-audit', label: 'RBAC Audit', href: '/enterprise/rbac-audit', icon: 'Lock' },
      { id: 'sessions', label: 'Session Management', href: '/enterprise/sessions', icon: 'Clock' },
    ],
  },
  {
    id: 'secops',
    title: 'Security Operations',
    icon: 'Radar',
    items: [
      { id: 'siem', label: 'SIEM Integration', href: '/enterprise/siem', icon: 'Monitor' },
      { id: 'incident-response', label: 'Incident Response', href: '/enterprise/incident-response', icon: 'AlertTriangle' },
      { id: 'threat-intel', label: 'Threat Intelligence', href: '/enterprise/threat-intel', icon: 'Shield' },
    ],
  },
  {
    id: 'supply-chain',
    title: 'Supply Chain',
    icon: 'Container',
    items: [
      { id: 'sbom', label: 'SBOM Manager', href: '/enterprise/sbom', icon: 'Package', badge: 'Soon' },
      { id: 'sigstore', label: 'Sigstore Verify', href: '/enterprise/sigstore', icon: 'BadgeCheck', badge: 'Soon' },
      { id: 'slsa', label: 'SLSA Provenance', href: '/enterprise/slsa', icon: 'GitCommitHorizontal', badge: 'Soon' },
    ],
  },
]
