/**
 * Fleet Compliance Heatmap — static data and pure cell builders.
 *
 * Extracted from FleetComplianceHeatmap.tsx to keep the card component focused
 * on rendering. Thresholds, status color maps, install missions, and the
 * per-tool cell builders live here.
 */

import type { KyvernoClusterStatus } from '../../hooks/useKyverno'
import type { TrivyClusterStatus } from '../../hooks/useTrivy'
import type { KubescapeClusterStatus } from '../../hooks/useKubescape'

/** Thresholds for color-coding vulnerability counts */
const VULN_CRITICAL_THRESHOLD = 5
const VULN_WARNING_THRESHOLD = 1

/** Thresholds for color-coding policy violations */
const POLICY_CRITICAL_THRESHOLD = 10
const POLICY_WARNING_THRESHOLD = 3

/** Threshold for color-coding Kubescape posture score (percentage) */
const POSTURE_GOOD_THRESHOLD = 80
const POSTURE_WARNING_THRESHOLD = 60

export type CellStatus = 'good' | 'warning' | 'critical' | 'not-installed'

export interface HeatmapCell {
  status: CellStatus
  label: string
  tooltip: string
}

export interface HeatmapRow {
  cluster: string
  kyverno: HeatmapCell
  kubescape: HeatmapCell
  trivy: HeatmapCell
}

export const STATUS_COLORS: Record<CellStatus, string> = {
  good: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  'not-installed': 'text-zinc-700 border-transparent',
}

export const STATUS_DOTS: Record<CellStatus, string> = {
  good: 'bg-green-400',
  warning: 'bg-yellow-400',
  critical: 'bg-red-400',
  'not-installed': 'hidden',
}

/** Install mission definitions for each compliance tool */
export const INSTALL_MISSIONS: Record<string, { title: string; description: string; prompt: string }> = {
  kyverno: {
    title: 'Install Kyverno',
    description: 'Install Kyverno for Kubernetes-native policy management',
    prompt: `I want to install Kyverno for policy management on my clusters.

Please help me:
1. Install Kyverno via Helm (audit mode only — do NOT enforce)
2. Verify the installation is running
3. Set up a basic audit policy (like requiring labels)

Use: helm install kyverno kyverno/kyverno --namespace kyverno --create-namespace --version v1.17.1 --set admissionController.replicas=1

Important: Set validationFailureAction to Audit (not Enforce) for all policies to avoid breaking workloads.

Please proceed step by step.`,
  },
  kubescape: {
    title: 'Install Kubescape',
    description: 'Install Kubescape Operator for security posture management',
    prompt: `I want to install the Kubescape Operator for security posture scanning on my clusters.

Please help me:
1. Install Kubescape Operator via Helm (scan-only, no enforcement)
2. Verify it's running and scanning
3. Check initial scan results

Use: helm install kubescape-operator kubescape/kubescape-operator --version 1.30.5 --namespace kubescape --create-namespace --set capabilities.continuousScan=enable

Please proceed step by step.`,
  },
  trivy: {
    title: 'Install Trivy Operator',
    description: 'Install Trivy Operator for container vulnerability scanning',
    prompt: `I want to install the Trivy Operator for vulnerability scanning on my clusters.

Please help me:
1. Install Trivy Operator via Helm (scan-only mode, no enforcement)
2. Verify the operator is running and scanning
3. Check for initial vulnerability reports

Use: helm install trivy-operator aquasecurity/trivy-operator --version 0.23.0 --namespace trivy --create-namespace

Please proceed step by step.`,
  },
  gatekeeper: {
    title: 'Install OPA Gatekeeper',
    description: 'Install OPA Gatekeeper for policy enforcement',
    prompt: `I want to install OPA Gatekeeper for policy enforcement on my clusters.

Please help me:
1. Install Gatekeeper via Helm
2. Verify the installation is running
3. Set up a basic constraint template and constraint (audit mode)

Use: helm install gatekeeper gatekeeper/gatekeeper --namespace gatekeeper-system --create-namespace --set auditInterval=60

Important: Start with audit mode — do NOT set enforcementAction to deny until policies are tested.

Please proceed step by step.`,
  },
  trestle: {
    title: 'Install Compliance Trestle',
    description: 'Install OSCAL Compass / Compliance Trestle for compliance-as-code (CNCF Sandbox)',
    prompt: `I want to install Compliance Trestle (OSCAL Compass) for compliance-as-code on my Kubernetes clusters.

Compliance Trestle is a CNCF Sandbox project that uses NIST OSCAL to automate compliance assessment.

Please help me:
1. Install the c2p (Compliance-to-Policy) controller:
   kubectl create namespace c2p-system
   kubectl apply -f https://raw.githubusercontent.com/oscal-compass/compliance-to-policy/main/deploy/kubernetes/c2p-controller.yaml

2. Set up an initial OSCAL profile (NIST 800-53 rev5):
   pip install compliance-trestle
   trestle init
   trestle import -f https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json -o nist-800-53

3. Configure the policy bridge to your existing engine (Kyverno, OPA, or Kubescape)

4. Verify assessment results: kubectl get assessmentresults -A

Please proceed step by step.`,
  },
}

export function buildKyvernoCell(ks: KyvernoClusterStatus | undefined): HeatmapCell {
  if (!ks || !ks.installed) {
    return { status: 'not-installed', label: '—', tooltip: 'Kyverno not installed' }
  }
  if (ks.totalPolicies === 0) {
    return { status: 'warning', label: 'No policies', tooltip: 'Kyverno installed but no policies configured' }
  }
  const violations = ks.totalViolations ?? 0
  const status: CellStatus = violations >= POLICY_CRITICAL_THRESHOLD ? 'critical'
    : violations >= POLICY_WARNING_THRESHOLD ? 'warning' : 'good'
  return {
    status,
    label: `${violations} violations`,
    tooltip: `${(ks.policies || []).length} policies, ${violations} violations`,
  }
}

export function buildTrivyCell(ts: TrivyClusterStatus | undefined): HeatmapCell {
  if (!ts || !ts.installed) {
    return { status: 'not-installed', label: '—', tooltip: 'Trivy not installed' }
  }
  if (ts.totalReports === 0) {
    return { status: 'warning', label: 'No reports', tooltip: 'Trivy installed but no vulnerability reports generated' }
  }
  const vuln = ts.vulnerabilities ?? { critical: 0, high: 0, medium: 0, low: 0 }
  const critHigh = vuln.critical + vuln.high
  const status: CellStatus = critHigh >= VULN_CRITICAL_THRESHOLD ? 'critical'
    : critHigh >= VULN_WARNING_THRESHOLD ? 'warning' : 'good'
  return {
    status,
    label: `${critHigh} crit/high`,
    tooltip: `C:${vuln.critical} H:${vuln.high} M:${vuln.medium} L:${vuln.low}`,
  }
}

export function buildKubescapeCell(kss: KubescapeClusterStatus | undefined): HeatmapCell {
  if (!kss || !kss.installed) {
    return { status: 'not-installed', label: '—', tooltip: 'Kubescape not installed' }
  }
  if (kss.totalControls === 0) {
    return { status: 'warning', label: 'No scans', tooltip: 'Kubescape installed but no scan data generated' }
  }
  const score = kss.overallScore
  const status: CellStatus = score >= POSTURE_GOOD_THRESHOLD ? 'good'
    : score >= POSTURE_WARNING_THRESHOLD ? 'warning' : 'critical'
  return {
    status,
    label: `${score}%`,
    tooltip: `Score: ${score}%, ${kss.passedControls}/${kss.totalControls} controls passing`,
  }
}
