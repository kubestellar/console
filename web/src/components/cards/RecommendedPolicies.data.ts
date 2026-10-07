/**
 * RecommendedPolicies data — recommendation categories, display styles,
 * and the catalog of policy definitions evaluated by the RecommendedPolicies card.
 */

// ─── Recommendation Categories ──────────────────────────────────────

export type RecommendationCategory = 'security' | 'best-practices' | 'supply-chain' | 'resources'

export interface PolicyRecommendation {
  id: string
  name: string
  description: string
  category: RecommendationCategory
  /** Which tool implements this (kyverno, gatekeeper, kubescape) */
  tool: string
  /** Clusters where this policy is already active */
  coveredClusters: string[]
  /** Total eligible clusters (where the tool is installed) */
  eligibleClusters: string[]
  /** All clusters in the fleet */
  totalClusters: number
  /** Severity if not deployed */
  severity: 'high' | 'medium' | 'low'
  /** AI mission prompt to deploy this policy */
  missionPrompt: string
}

export const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  'security': 'Security Hardening',
  'best-practices': 'Best Practices',
  'supply-chain': 'Supply Chain',
  'resources': 'Resource Governance' }

export const CATEGORY_COLORS: Record<RecommendationCategory, string> = {
  'security': 'text-red-400',
  'best-practices': 'text-blue-400',
  'supply-chain': 'text-purple-400',
  'resources': 'text-orange-400' }

export const CATEGORY_BG: Record<RecommendationCategory, string> = {
  'security': 'bg-red-500/10 border-red-500/20',
  'best-practices': 'bg-blue-500/10 border-blue-500/20',
  'supply-chain': 'bg-purple-500/10 border-purple-500/20',
  'resources': 'bg-orange-500/10 border-orange-500/20' }

export const SEVERITY_COLORS: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400' }

// ─── Policy Definitions ─────────────────────────────────────────────

/** Well-known Kyverno policy names that map to recommendations */
export const KYVERNO_POLICY_PATTERNS: Record<string, string> = {
  'disallow-privileged': 'kyverno-disallow-privileged',
  'privileged': 'kyverno-disallow-privileged',
  'require-labels': 'kyverno-require-labels',
  'require-label': 'kyverno-require-labels',
  'restrict-image-registries': 'kyverno-restrict-registries',
  'restrict-registries': 'kyverno-restrict-registries',
  'require-resource-limits': 'kyverno-require-resources',
  'require-limits': 'kyverno-require-resources',
  'resource-limits': 'kyverno-require-resources',
  'disallow-latest-tag': 'kyverno-disallow-latest',
  'disallow-latest': 'kyverno-disallow-latest',
  'require-run-as-nonroot': 'kyverno-run-as-nonroot',
  'run-as-nonroot': 'kyverno-run-as-nonroot',
  'require-probes': 'kyverno-require-probes',
  'require-readiness': 'kyverno-require-probes' }

export interface PolicyDefinition {
  id: string
  name: string
  description: string
  category: RecommendationCategory
  tool: string
  severity: 'high' | 'medium' | 'low'
  /** Function to check if this policy exists on a cluster */
  policyPatternKey: string
  missionPrompt: string
}

export const POLICY_DEFINITIONS: PolicyDefinition[] = [
  {
    id: 'kyverno-disallow-privileged',
    name: 'Disallow Privileged Containers',
    description: 'Prevent containers from running in privileged mode — a critical security control',
    category: 'security',
    tool: 'kyverno',
    severity: 'high',
    policyPatternKey: 'disallow-privileged',
    missionPrompt: `Deploy a Kyverno ClusterPolicy to disallow privileged containers across all clusters where Kyverno is installed.

Policy requirements:
- Name: disallow-privileged-containers
- Mode: Audit (validationFailureAction: Audit) — do NOT enforce
- Match: All pods in all namespaces (exclude kube-system, kyverno)
- Rule: Deny spec.containers[*].securityContext.privileged = true
- Background: true (scan existing resources)
- Category annotation: "Pod Security"

Deploy to ALL clusters with Kyverno installed. After applying, check PolicyReports are generated.
Proceed step by step for each cluster.` },
  {
    id: 'kyverno-require-labels',
    name: 'Require Standard Labels',
    description: 'Enforce app.kubernetes.io/name and managed-by labels on all pods',
    category: 'best-practices',
    tool: 'kyverno',
    severity: 'medium',
    policyPatternKey: 'require-labels',
    missionPrompt: `Deploy a Kyverno ClusterPolicy to require standard Kubernetes labels on all pods across the fleet.

Policy requirements:
- Name: require-labels
- Mode: Audit (validationFailureAction: Audit)
- Required labels: app.kubernetes.io/name, app.kubernetes.io/managed-by
- Match: All pods (exclude kube-system, kyverno namespaces)
- Background: true
- Category annotation: "Best Practices"

Deploy to ALL clusters with Kyverno installed. Proceed step by step.` },
  {
    id: 'kyverno-restrict-registries',
    name: 'Restrict Image Registries',
    description: 'Only allow images from approved registries (docker.io, gcr.io, ghcr.io, quay.io)',
    category: 'supply-chain',
    tool: 'kyverno',
    severity: 'high',
    policyPatternKey: 'restrict-image-registries',
    missionPrompt: `Deploy a Kyverno ClusterPolicy to restrict container image registries across the fleet.

Policy requirements:
- Name: restrict-image-registries
- Mode: Audit (validationFailureAction: Audit)
- Allowed registries: docker.io/*, gcr.io/*, ghcr.io/*, quay.io/*, registry.k8s.io/*
- Match: All pods (exclude kube-system, kyverno)
- Background: true
- Category annotation: "Supply Chain Security"

Deploy to ALL clusters with Kyverno installed. Proceed step by step.` },
  {
    id: 'kyverno-require-resources',
    name: 'Require Resource Limits',
    description: 'Ensure all containers have CPU and memory limits defined',
    category: 'resources',
    tool: 'kyverno',
    severity: 'medium',
    policyPatternKey: 'require-resource-limits',
    missionPrompt: `Deploy a Kyverno ClusterPolicy to require resource limits on all containers across the fleet.

Policy requirements:
- Name: require-resource-limits
- Mode: Audit (validationFailureAction: Audit)
- Required: spec.containers[*].resources.limits.cpu and .memory
- Match: All pods (exclude kube-system, kyverno)
- Background: true
- Category annotation: "Resource Management"

Deploy to ALL clusters with Kyverno installed. Proceed step by step.` },
  {
    id: 'kyverno-disallow-latest',
    name: 'Disallow Latest Tag',
    description: 'Prevent using :latest image tag for reproducible deployments',
    category: 'supply-chain',
    tool: 'kyverno',
    severity: 'medium',
    policyPatternKey: 'disallow-latest-tag',
    missionPrompt: `Deploy a Kyverno ClusterPolicy to disallow the :latest image tag across the fleet.

Policy requirements:
- Name: disallow-latest-tag
- Mode: Audit (validationFailureAction: Audit)
- Rule: Deny images without a tag or with tag "latest"
- Match: All pods (exclude kube-system, kyverno)
- Background: true
- Category annotation: "Supply Chain Security"

Deploy to ALL clusters with Kyverno installed. Proceed step by step.` },
  {
    id: 'kyverno-run-as-nonroot',
    name: 'Run As Non-Root',
    description: 'Require containers to run as non-root user',
    category: 'security',
    tool: 'kyverno',
    severity: 'high',
    policyPatternKey: 'require-run-as-nonroot',
    missionPrompt: `Deploy a Kyverno ClusterPolicy requiring containers to run as non-root across the fleet.

Policy requirements:
- Name: require-run-as-nonroot
- Mode: Audit (validationFailureAction: Audit)
- Rule: Require spec.securityContext.runAsNonRoot = true or spec.containers[*].securityContext.runAsNonRoot = true
- Match: All pods (exclude kube-system, kyverno)
- Background: true
- Category annotation: "Pod Security"

Deploy to ALL clusters with Kyverno installed. Proceed step by step.` },
  {
    id: 'kyverno-require-probes',
    name: 'Require Health Probes',
    description: 'Ensure all containers have readiness and liveness probes configured',
    category: 'best-practices',
    tool: 'kyverno',
    severity: 'low',
    policyPatternKey: 'require-probes',
    missionPrompt: `Deploy a Kyverno ClusterPolicy requiring readiness and liveness probes on all containers across the fleet.

Policy requirements:
- Name: require-probes
- Mode: Audit (validationFailureAction: Audit)
- Required: spec.containers[*].readinessProbe and .livenessProbe
- Match: All Deployments, StatefulSets, DaemonSets (exclude kube-system, kyverno)
- Background: true
- Category annotation: "Best Practices"

Deploy to ALL clusters with Kyverno installed. Proceed step by step.` },
]
