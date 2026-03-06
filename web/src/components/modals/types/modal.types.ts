import type { ReactNode, ComponentType } from 'react'

// ============================================================================
// Resource Kinds - Matches Kubernetes resource types
// ============================================================================

export type ResourceKind =
  | 'Cluster'
  | 'Namespace'
  | 'Node'
  | 'Pod'
  | 'Deployment'
  | 'ReplicaSet'
  | 'StatefulSet'
  | 'DaemonSet'
  | 'Job'
  | 'CronJob'
  | 'Service'
  | 'Ingress'
  | 'ConfigMap'
  | 'Secret'
  | 'PersistentVolumeClaim'
  | 'PersistentVolume'
  | 'StorageClass'
  | 'ServiceAccount'
  | 'Role'
  | 'RoleBinding'
  | 'ClusterRole'
  | 'ClusterRoleBinding'
  | 'HorizontalPodAutoscaler'
  | 'NetworkPolicy'
  | 'Event'
  | 'HelmRelease'
  | 'BuildpackImage'
  | 'ArgoApplication'
  | 'Operator'
  | 'CRD'
  | 'Policy'
  | 'Alert'
  | 'AlertRule'
  | 'Custom'

// ============================================================================
// Resource Context - Core information about a resource
// ============================================================================

export interface ResourceContext {
  cluster: string
  namespace?: string
  kind: ResourceKind
  name: string
  apiVersion?: string
  uid?: string
  status?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

// ============================================================================
// Navigation Types
// ============================================================================

export interface Breadcrumb {
  id: string
  label: string
  kind: ResourceKind
  icon?: ComponentType<{ className?: string }>
  context: Partial<ResourceContext>
  onClick?: () => void
}

export interface NavigationTarget {
  kind: ResourceKind
  name: string
  namespace?: string
  cluster: string
  data?: Record<string, unknown>
}

export interface NavigationState {
  stack: NavigationTarget[]
  currentIndex: number
}

// ============================================================================
// Related Resources
// ============================================================================

export type RelationshipType = 'parent' | 'child' | 'reference' | 'peer'

export interface RelatedResource {
  kind: ResourceKind
  name: string
  namespace?: string
  cluster: string
  relationship: RelationshipType
  reason?: string // e.g., "owner", "uses-configmap", "exposes"
  status?: string
  onClick?: () => void
}

export interface ResourceRelations {
  parents: RelatedResource[]
  children: RelatedResource[]
  references: RelatedResource[]
  peers: RelatedResource[]
}

// Resource kind relationships map
export const RESOURCE_RELATIONSHIPS: Partial<Record<ResourceKind, {
  parents: ResourceKind[]
  children: ResourceKind[]
  references: ResourceKind[]
}>> = {
  Pod: {
    parents: ['Deployment', 'ReplicaSet', 'DaemonSet', 'StatefulSet', 'Job'],
    children: [],
    references: ['ConfigMap', 'Secret', 'PersistentVolumeClaim', 'Service', 'ServiceAccount'],
  },
  Deployment: {
    parents: [],
    children: ['ReplicaSet', 'Pod'],
    references: ['ConfigMap', 'Secret', 'Service', 'HorizontalPodAutoscaler'],
  },
  ReplicaSet: {
    parents: ['Deployment'],
    children: ['Pod'],
    references: [],
  },
  StatefulSet: {
    parents: [],
    children: ['Pod', 'PersistentVolumeClaim'],
    references: ['ConfigMap', 'Secret', 'Service'],
  },
  DaemonSet: {
    parents: [],
    children: ['Pod'],
    references: ['ConfigMap', 'Secret'],
  },
  Job: {
    parents: ['CronJob'],
    children: ['Pod'],
    references: ['ConfigMap', 'Secret'],
  },
  CronJob: {
    parents: [],
    children: ['Job'],
    references: ['ConfigMap', 'Secret'],
  },
  Service: {
    parents: [],
    children: [],
    references: ['Pod', 'Deployment', 'Ingress'],
  },
  Ingress: {
    parents: [],
    children: [],
    references: ['Service', 'Secret'],
  },
  PersistentVolumeClaim: {
    parents: [],
    children: [],
    references: ['PersistentVolume', 'StorageClass'],
  },
  Namespace: {
    parents: ['Cluster'],
    children: ['Pod', 'Deployment', 'Service', 'ConfigMap', 'Secret'],
    references: [],
  },
  Node: {
    parents: ['Cluster'],
    children: ['Pod'],
    references: [],
  },
  HelmRelease: {
    parents: [],
    children: ['Deployment', 'Service', 'ConfigMap', 'Secret'],
    references: [],
  },
  ArgoApplication: {
    parents: [],
    children: ['Deployment', 'Service'],
    references: [],
  },
  Operator: {
    parents: [],
    children: ['CRD'],
    references: [],
  },
}

// ============================================================================
// AI Integration
// ============================================================================

export type AIActionId = 'diagnose' | 'repair' | 'ask' | 'custom'
export type MissionType = 'troubleshoot' | 'repair' | 'analyze' | 'deploy' | 'custom'

export interface AIAction {
  id: AIActionId
  label: string
  icon: ComponentType<{ className?: string }>
  description: string
  missionType: MissionType
  promptTemplate: string
  disabled?: boolean
  disabledReason?: string
}

export interface MissionSuggestion {
  id: string
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  missionType: MissionType
  prompt: string
}

// ============================================================================
// Modal Props
// ============================================================================

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface StandardModalProps {
  // Core
  isOpen: boolean
  onClose: () => void

  // Resource context
  resource: ResourceContext

  // Navigation (managed by context when omitted)
  breadcrumbs?: Breadcrumb[]
  onNavigate?: (target: NavigationTarget) => void
  onBack?: () => void

  // AI actions (auto-generated when omitted)
  aiActions?: AIAction[]
  onAIAction?: (action: AIAction) => void

  // Related resources (fetched when omitted)
  relations?: ResourceRelations

  // Content
  tabs?: TabDefinition[]
  sections?: SectionDefinition[]
  children?: ReactNode

  // Options
  size?: ModalSize
  showFooter?: boolean
  showAIBar?: boolean
}

// ============================================================================
// Content Definitions (for YAML-based generation)
// ============================================================================

export interface TabDefinition {
  id: string
  label: string
  icon?: ComponentType<{ className?: string }>
  sections: SectionDefinition[]
  badge?: string | number
}

export type SectionType =
  | 'key-value-pairs'
  | 'container-list'
  | 'event-stream'
  | 'log-viewer'
  | 'yaml-viewer'
  | 'related-resources'
  | 'metrics-chart'
  | 'status-timeline'
  | 'quick-actions'
  | 'ai-suggestions'
  | 'custom'

export interface SectionDefinition {
  type: SectionType
  title?: string
  props?: Record<string, unknown>
  component?: ReactNode
}

export interface FieldDefinition {
  key: string
  label: string
  type: 'text' | 'status' | 'timestamp' | 'json' | 'link' | 'badge' | 'code'
  copyable?: boolean
  linkTo?: NavigationTarget
}

// ============================================================================
// Modal Definition (for YAML-based factory)
// ============================================================================

export interface ModalDefinition {
  kind: ResourceKind
  title: string
  icon: string // Icon name from lucide-react
  size: ModalSize
  sections?: ModalSectionDefinition[]
  tabs?: ModalTabDefinition[]
  actions: ModalActionDefinition[]
  relatedKinds: {
    parents: ResourceKind[]
    children: ResourceKind[]
    references: ResourceKind[]
  }
}

export interface ModalSectionDefinition {
  type: SectionType
  title?: string
  fields?: FieldDefinition[]
  props?: Record<string, unknown>
}

export interface ModalTabDefinition {
  id: string
  label: string
  icon?: string
  sections: ModalSectionDefinition[]
}

export interface ModalActionDefinition {
  id: string
  label: string
  icon: string
  type: 'ai' | 'kubectl' | 'navigate' | 'custom'
  mission?: string // Mission template ID for AI actions
  command?: string // kubectl command template
  target?: string // Navigation target
}

// ============================================================================
// Utility Types
// ============================================================================

export interface KeyValuePair {
  key: string
  value: string | number | boolean | null
  copyable?: boolean
  link?: NavigationTarget
}

export interface QuickAction {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  description?: string
  command?: string
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}

// ============================================================================
// Icon mapping for resource kinds
// ============================================================================

export const RESOURCE_KIND_ICONS: Record<ResourceKind, string> = {
  Cluster: 'Server',
  Namespace: 'FolderTree',
  Node: 'Box',
  Pod: 'Box',
  Deployment: 'Layers',
  ReplicaSet: 'Copy',
  StatefulSet: 'Database',
  DaemonSet: 'Workflow',
  Job: 'PlayCircle',
  CronJob: 'Clock',
  Service: 'Globe',
  Ingress: 'ArrowRightLeft',
  ConfigMap: 'FileJson',
  Secret: 'KeyRound',
  PersistentVolumeClaim: 'HardDrive',
  PersistentVolume: 'HardDrive',
  StorageClass: 'Layers',
  ServiceAccount: 'UserCircle',
  Role: 'Shield',
  RoleBinding: 'Link',
  ClusterRole: 'ShieldCheck',
  ClusterRoleBinding: 'Link2',
  HorizontalPodAutoscaler: 'Scale',
  NetworkPolicy: 'Network',
  Event: 'Zap',
  HelmRelease: 'Ship',
  BuildpackImage: 'Package',
  ArgoApplication: 'GitBranch',
  Operator: 'Settings',
  CRD: 'Puzzle',
  Policy: 'ShieldAlert',
  Alert: 'Bell',
  AlertRule: 'BellRing',
  Custom: 'File',
}

// ============================================================================
// Status colors — delegates to canonical statusColors.ts
// ============================================================================

import { getStatusColors as getCanonicalStatusColors } from '../../../lib/cards/statusColors'

export function getStatusColors(status: string): { bg: string; text: string; border: string } {
  const c = getCanonicalStatusColors(status)
  return { bg: c.bg, text: c.text, border: c.border }
}
