/**
 * Compliance tool descriptions, framework info, and severity context.
 *
 * Used by compliance dashboard cards to help users understand
 * what is being measured and why it matters.
 */

// ── Kubescape Framework Descriptions ──────────────────────────────────

export interface FrameworkInfo {
  /** Short human-readable label */
  label: string
  /** One-line description of what this framework checks */
  description: string
  /** Why this matters to the user */
  impact: string
  /** Link to the framework specification */
  url: string
}

/** Known Kubescape security frameworks with descriptions */
export const KUBESCAPE_FRAMEWORKS: Record<string, FrameworkInfo> = {
  'NSA': {
    label: 'NSA-CISA',
    description: 'US government Kubernetes hardening guide',
    impact: 'Protects against misconfigurations that nation-state attackers exploit',
    url: 'https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF',
  },
  'nsa': {
    label: 'NSA-CISA',
    description: 'US government Kubernetes hardening guide',
    impact: 'Protects against misconfigurations that nation-state attackers exploit',
    url: 'https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF',
  },
  'MITRE': {
    label: 'MITRE ATT&CK',
    description: 'Container threat model based on real-world attacks',
    impact: 'Maps your defenses against known attacker techniques',
    url: 'https://attack.mitre.org/matrices/enterprise/containers/',
  },
  'mitre': {
    label: 'MITRE ATT&CK',
    description: 'Container threat model based on real-world attacks',
    impact: 'Maps your defenses against known attacker techniques',
    url: 'https://attack.mitre.org/matrices/enterprise/containers/',
  },
  'CIS': {
    label: 'CIS Benchmark',
    description: 'Industry-standard Kubernetes hardening rules',
    impact: 'Required for most compliance certifications (SOC2, PCI-DSS, HIPAA)',
    url: 'https://www.cisecurity.org/benchmark/kubernetes',
  },
  'cis': {
    label: 'CIS Benchmark',
    description: 'Industry-standard Kubernetes hardening rules',
    impact: 'Required for most compliance certifications (SOC2, PCI-DSS, HIPAA)',
    url: 'https://www.cisecurity.org/benchmark/kubernetes',
  },
  'ArmoBest': {
    label: 'ARMO Best Practices',
    description: 'Kubescape-native security best practices',
    impact: 'Catches common misconfigurations specific to Kubernetes workloads',
    url: 'https://hub.armosec.io/docs/controls',
  },
  'DevOpsBest': {
    label: 'DevOps Best Practices',
    description: 'Operational readiness checks for production clusters',
    impact: 'Ensures workloads are production-ready with proper health checks and limits',
    url: 'https://hub.armosec.io/docs/controls',
  },
}

/** Look up framework info by name (case-insensitive partial match) */
export function getFrameworkInfo(name: string): FrameworkInfo | null {
  // Exact match first
  if (KUBESCAPE_FRAMEWORKS[name]) return KUBESCAPE_FRAMEWORKS[name]

  // Partial match (e.g., "NSA-CISA" matches "NSA")
  const lower = name.toLowerCase()
  for (const [key, info] of Object.entries(KUBESCAPE_FRAMEWORKS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return info
    }
  }
  return null
}

// ── Kubescape Score Context ───────────────────────────────────────────

/** Contextual label for a Kubescape overall score */
export function getScoreContext(score: number): { label: string; description: string; color: string } {
  if (score >= 90) return {
    label: 'Excellent',
    description: 'Your clusters exceed industry security benchmarks',
    color: 'text-green-400',
  }
  if (score >= 80) return {
    label: 'Good',
    description: 'Minor hardening gaps — review failing controls',
    color: 'text-green-400',
  }
  if (score >= 60) return {
    label: 'Needs Attention',
    description: 'Significant security gaps found — prioritize critical controls',
    color: 'text-yellow-400',
  }
  return {
    label: 'Critical',
    description: 'Major security risks — immediate remediation recommended',
    color: 'text-red-400',
  }
}

// ── Trivy Severity Context ────────────────────────────────────────────

export interface SeverityInfo {
  label: string
  description: string
  action: string
}

/** Trivy vulnerability severity level descriptions */
export const TRIVY_SEVERITY: Record<string, SeverityInfo> = {
  critical: {
    label: 'Critical',
    description: 'Actively exploited CVEs with public exploits',
    action: 'Patch immediately — these have known exploits in the wild',
  },
  high: {
    label: 'High',
    description: 'Serious vulnerabilities that could lead to compromise',
    action: 'Schedule patching within days',
  },
  medium: {
    label: 'Medium',
    description: 'Vulnerabilities requiring specific conditions to exploit',
    action: 'Plan remediation in next maintenance window',
  },
  low: {
    label: 'Low',
    description: 'Minor issues with limited impact',
    action: 'Address during regular image updates',
  },
}

// ── Tool Descriptions ─────────────────────────────────────────────────

export interface ToolDescription {
  name: string
  tagline: string
  measures: string
  whyItMatters: string
}

export const TOOL_DESCRIPTIONS: Record<string, ToolDescription> = {
  kyverno: {
    name: 'Kyverno',
    tagline: 'Kubernetes-native policy engine',
    measures: 'Policy compliance — validates, mutates, and generates resources based on rules you define',
    whyItMatters: 'Prevents misconfigurations from reaching production by enforcing guardrails on every resource change',
  },
  trivy: {
    name: 'Trivy',
    tagline: 'Container vulnerability scanner',
    measures: 'Known CVEs in container images running across your fleet',
    whyItMatters: 'Unpatched vulnerabilities are the #1 attack vector — Trivy finds them before attackers do',
  },
  kubescape: {
    name: 'Kubescape',
    tagline: 'Security posture management',
    measures: 'Cluster configuration against NSA, MITRE, and CIS security frameworks',
    whyItMatters: 'Measures how hardened your clusters are against real-world attack techniques and compliance standards',
  },
  gatekeeper: {
    name: 'OPA Gatekeeper',
    tagline: 'Policy enforcement with Open Policy Agent',
    measures: 'Resource compliance using Rego policies and constraint templates',
    whyItMatters: 'Provides fine-grained policy control with the flexibility of the Rego policy language',
  },
  trestle: {
    name: 'Compliance Trestle',
    tagline: 'Compliance-as-code with NIST OSCAL (CNCF Sandbox)',
    measures: 'OSCAL-based compliance assessment against NIST 800-53, FedRAMP, and custom profiles',
    whyItMatters: 'Automates compliance documentation and continuous assessment using the NIST standard, bridging policy engines to regulatory frameworks',
  },
}

// ── Card-Level Descriptions ───────────────────────────────────────────

/** Brief card descriptions shown as context banners */
export const CARD_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  fleet_compliance_heatmap: {
    title: 'Fleet Compliance Heatmap',
    description: 'Cross-cluster compliance at a glance. Each cell shows the health of a specific tool on a specific cluster.',
  },
  compliance_drift: {
    title: 'Compliance Drift',
    description: 'Flags clusters that deviate from the fleet average. Drift indicates inconsistent security posture across your fleet.',
  },
  cross_cluster_policy_comparison: {
    title: 'Policy Comparison',
    description: 'Compares which Kyverno policies are deployed on which clusters. Gaps mean inconsistent enforcement.',
  },
  compliance_score: {
    title: 'Compliance Score',
    description: 'Composite score combining all compliance tools. Higher is better — 100% means all controls passing, all policies clean.',
  },
  policy_violations: {
    title: 'Policy Violations',
    description: 'Resources failing policy checks. Each violation is a misconfiguration that could be a security risk.',
  },
  trestle_scan: {
    title: 'Compliance Trestle (OSCAL)',
    description: 'NIST OSCAL compliance assessment. Shows control pass/fail status across profiles like NIST 800-53 and FedRAMP.',
  },
}
