/**
 * Shared resource category definitions for dependency grouping.
 *
 * Used by ResourceMarshall and WorkloadMonitor cards to group
 * Kubernetes resources into meaningful categories with icons.
 */

import { LucideIcon } from 'lucide-react'
import {
  FileText,
  KeyRound,
  User,
  Network,
  Globe,
  HardDrive,
  Shield,
  Gauge,
  ShieldCheck,
  Server,
  Blocks,
  ShieldAlert,
} from 'lucide-react'
import type { ResourceCategory } from '../types/workloadMonitor'

// ============================================================================
// Category Definitions
// ============================================================================

export interface DependencyCategory {
  /** Display label */
  label: string
  /** Kubernetes resource kinds in this category */
  kinds: string[]
  /** Icon component for the category */
  icon: LucideIcon
  /** Mapped ResourceCategory value */
  category: ResourceCategory
}

/** Category grouping for dependency kinds */
export const DEP_CATEGORIES: DependencyCategory[] = [
  { label: 'RBAC & Identity', kinds: ['ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding'], icon: Shield, category: 'rbac' },
  { label: 'Configuration', kinds: ['ConfigMap', 'Secret'], icon: FileText, category: 'config' },
  { label: 'Networking', kinds: ['Service', 'Ingress', 'NetworkPolicy'], icon: Network, category: 'networking' },
  { label: 'Scaling & Availability', kinds: ['HorizontalPodAutoscaler', 'PodDisruptionBudget'], icon: Gauge, category: 'scaling' },
  { label: 'Storage', kinds: ['PersistentVolumeClaim'], icon: HardDrive, category: 'storage' },
  { label: 'Custom Resources', kinds: ['CustomResourceDefinition'], icon: Blocks, category: 'crd' },
  { label: 'Admission Control', kinds: ['ValidatingWebhookConfiguration', 'MutatingWebhookConfiguration'], icon: ShieldAlert, category: 'admission' },
]

// ============================================================================
// Kind → Icon Mapping
// ============================================================================

/** Icon per dependency kind */
export const KIND_ICONS: Record<string, LucideIcon> = {
  ServiceAccount: User,
  Role: Shield,
  RoleBinding: ShieldCheck,
  ClusterRole: Shield,
  ClusterRoleBinding: ShieldCheck,
  ConfigMap: FileText,
  Secret: KeyRound,
  Service: Server,
  Ingress: Globe,
  NetworkPolicy: Network,
  HorizontalPodAutoscaler: Gauge,
  PodDisruptionBudget: Shield,
  PersistentVolumeClaim: HardDrive,
  CustomResourceDefinition: Blocks,
  ValidatingWebhookConfiguration: ShieldAlert,
  MutatingWebhookConfiguration: ShieldAlert,
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Get the ResourceCategory for a given Kubernetes kind */
export function getCategoryForKind(kind: string): ResourceCategory {
  for (const cat of DEP_CATEGORIES) {
    if (cat.kinds.includes(kind)) return cat.category
  }
  return 'other'
}

/** Get the icon component for a given Kubernetes kind */
export function getIconForKind(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? FileText
}

/** Set of all known dependency kinds across all categories */
export const KNOWN_DEPENDENCY_KINDS = new Set(DEP_CATEGORIES.flatMap(c => c.kinds))
