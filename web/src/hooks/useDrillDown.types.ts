import { ReactNode } from 'react'

export type DrillDownViewType =
  | 'cluster'
  | 'namespace'
  | 'deployment'
  | 'replicaset'
  | 'pod'
  | 'service'
  | 'configmap'
  | 'secret'
  | 'serviceaccount'
  | 'pvc'
  | 'job'
  | 'hpa'
  | 'node'
  | 'events'
  | 'logs'
  | 'gpu-node'
  | 'gpu-namespace'
  | 'yaml'
  | 'resources'
  | 'custom'
  // Phase 2: GitOps and operational views
  | 'helm'
  | 'argoapp'
  | 'kustomization'
  | 'buildpack'
  | 'drift'
  // Phase 2: Policy and compliance views
  | 'policy'
  | 'compliance'
  | 'crd'
  // Phase 2: Alerting and monitoring views
  | 'alert'
  | 'alertrule'
  // Phase 2: Cost and RBAC views
  | 'cost'
  | 'rbac'
  // Phase 2: Operator views
  | 'operator'
  // Multi-cluster summary views (for stat blocks)
  | 'all-clusters'
  | 'all-namespaces'
  | 'all-deployments'
  | 'all-pods'
  | 'all-services'
  | 'all-nodes'
  | 'all-events'
  | 'all-alerts'
  | 'all-helm'
  | 'all-operators'
  | 'all-security'
  | 'all-gpu'
  | 'all-storage'
  | 'all-jobs'
  // Quantum computing views
  | 'quantum-credentials'

export interface DrillDownView {
  type: DrillDownViewType
  title: string
  subtitle?: string
  data: Record<string, unknown>
  // Optional custom component to render
  customComponent?: ReactNode
}

export interface DrillDownState {
  isOpen: boolean
  stack: DrillDownView[]
  currentView: DrillDownView | null
}

export interface DrillDownContextType {
  state: DrillDownState
  // Open drill-down with initial view
  open: (view: DrillDownView) => void
  // Push a new view onto the stack (drill deeper)
  push: (view: DrillDownView) => void
  // Pop the current view (go back)
  pop: () => void
  // Go back to a specific index in the stack
  goTo: (index: number) => void
  // Close the drill-down modal
  close: () => void
  // Replace current view
  replace: (view: DrillDownView) => void
  // Open or push: opens if closed, pushes if open, navigates to existing
  // if the view is already in the stack. Reads provider state from a ref to
  // avoid stale-closure bugs when callers haven't re-rendered yet.
  openOrPush: (view: DrillDownView) => void
}
