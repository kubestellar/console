// Violation detail interface
export interface Violation {
  name: string
  namespace: string
  kind: string
  policy: string
  message: string
  severity: 'critical' | 'warning' | 'info'
}

// Policy interface for real data
export interface Policy {
  name: string
  kind: string // ConstraintTemplate kind
  violations: number
  mode: 'warn' | 'enforce' | 'dryrun' | 'deny'
}

export interface GatekeeperStatus {
  cluster: string
  installed: boolean
  policyCount?: number
  violationCount?: number
  mode?: 'dryrun' | 'warn' | 'enforce' | 'deny'
  modes?: ('warn' | 'enforce' | 'dryrun')[]  // All active modes for multi-badge display
  loading: boolean
  error?: string
  policies?: Policy[]
  violations?: Violation[]
}

// Item type for useCardData - enriched cluster with a 'cluster' field for filtering
export interface OPAClusterItem {
  name: string
  cluster: string // same as name, required for useCardData cluster filtering
  healthy?: boolean
  reachable?: boolean
}

// StartMission callback type shared across OPA modal components
export type StartMissionFn = (mission: {
  title: string
  description: string
  type: 'upgrade' | 'troubleshoot' | 'analyze' | 'deploy' | 'repair' | 'custom'
  cluster: string
  initialPrompt: string
  context?: Record<string, unknown>
}) => void

// Common OPA Gatekeeper policy templates
export const POLICY_TEMPLATES = [
  {
    name: 'Require Labels',
    description: 'Require specific labels on resources',
    kind: 'K8sRequiredLabels',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequiredlabels
spec:
  crd:
    spec:
      names:
        kind: K8sRequiredLabels
      validation:
        openAPIV3Schema:
          type: object
          properties:
            labels:
              type: array
              items:
                type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8srequiredlabels
        violation[{"msg": msg}] {
          provided := {label | input.review.object.metadata.labels[label]}
          required := {label | label := input.parameters.labels[_]}
          missing := required - provided
          count(missing) > 0
          msg := sprintf("Missing required labels: %v", [missing])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: require-team-label
spec:
  enforcementAction: warn
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Namespace"]
  parameters:
    labels: ["team", "owner"]`,
  },
  {
    name: 'Restrict Image Registries',
    description: 'Only allow images from approved registries',
    kind: 'K8sAllowedRepos',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sallowedrepos
spec:
  crd:
    spec:
      names:
        kind: K8sAllowedRepos
      validation:
        openAPIV3Schema:
          type: object
          properties:
            repos:
              type: array
              items:
                type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sallowedrepos
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          satisfied := [good | repo = input.parameters.repos[_]; good = startswith(container.image, repo)]
          not any(satisfied)
          msg := sprintf("Container image %v is not from an allowed registry", [container.image])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sAllowedRepos
metadata:
  name: allowed-repos
spec:
  enforcementAction: warn
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
  parameters:
    repos:
      - "gcr.io/"
      - "docker.io/"`,
  },
  {
    name: 'Require Resource Limits',
    description: 'Require CPU and memory limits on containers',
    kind: 'K8sRequireResourceLimits',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequireresourcelimits
spec:
  crd:
    spec:
      names:
        kind: K8sRequireResourceLimits
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8srequireresourcelimits
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          not container.resources.limits.cpu
          msg := sprintf("Container %v does not have CPU limits", [container.name])
        }
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          not container.resources.limits.memory
          msg := sprintf("Container %v does not have memory limits", [container.name])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequireResourceLimits
metadata:
  name: require-resource-limits
spec:
  enforcementAction: warn
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]`,
  },
  {
    name: 'Block Privileged Containers',
    description: 'Prevent privileged containers from running',
    kind: 'K8sBlockPrivileged',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sblockprivileged
spec:
  crd:
    spec:
      names:
        kind: K8sBlockPrivileged
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sblockprivileged
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          container.securityContext.privileged == true
          msg := sprintf("Privileged containers are not allowed: %v", [container.name])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sBlockPrivileged
metadata:
  name: block-privileged
spec:
  enforcementAction: deny
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]`,
  },
]
