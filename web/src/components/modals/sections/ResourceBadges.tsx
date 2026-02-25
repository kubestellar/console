import {
  Server,
  Box,
  Layers,
  Copy,
  Database,
  Workflow,
  PlayCircle,
  Clock,
  Globe,
  ArrowRightLeft,
  FileJson,
  KeyRound,
  HardDrive,
  UserCircle,
  Shield,
  Link,
  ShieldCheck,
  Link2,
  Scale,
  Network,
  Zap,
  Ship,
  GitBranch,
  Settings,
  Puzzle,
  ShieldAlert,
  Bell,
  BellRing,
  File,
  FolderTree,
  Package,
} from 'lucide-react'
import type { ResourceKind, ResourceContext } from '../types/modal.types'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'

// Icon mapping for resource kinds
const RESOURCE_ICONS: Record<ResourceKind, typeof Box> = {
  Cluster: Server,
  Namespace: FolderTree,
  Node: Box,
  Pod: Box,
  Deployment: Layers,
  ReplicaSet: Copy,
  StatefulSet: Database,
  DaemonSet: Workflow,
  Job: PlayCircle,
  CronJob: Clock,
  Service: Globe,
  Ingress: ArrowRightLeft,
  ConfigMap: FileJson,
  Secret: KeyRound,
  PersistentVolumeClaim: HardDrive,
  PersistentVolume: HardDrive,
  StorageClass: Layers,
  ServiceAccount: UserCircle,
  Role: Shield,
  RoleBinding: Link,
  ClusterRole: ShieldCheck,
  ClusterRoleBinding: Link2,
  HorizontalPodAutoscaler: Scale,
  NetworkPolicy: Network,
  Event: Zap,
  HelmRelease: Ship,
  BuildpackImage: Package,
  ArgoApplication: GitBranch,
  Operator: Settings,
  CRD: Puzzle,
  Policy: ShieldAlert,
  Alert: Bell,
  AlertRule: BellRing,
  Custom: File,
}

// Color mapping for resource kinds
const RESOURCE_COLORS: Partial<Record<ResourceKind, { bg: string; text: string; border: string }>> = {
  Pod: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  Deployment: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  Service: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  Node: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  Namespace: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  ConfigMap: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  Secret: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  HelmRelease: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  Alert: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  Policy: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
}

const DEFAULT_COLORS = { bg: 'bg-gray-500/20', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-500/30' }

interface ResourceBadgesProps {
  /** Resource context to display badges for */
  resource: ResourceContext
  /** Size of the badges */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to show the cluster badge */
  showCluster?: boolean
  /** Whether to show the namespace badge */
  showNamespace?: boolean
  /** Whether to show the resource kind badge */
  showKind?: boolean
  /** Whether to show icons in badges */
  showIcons?: boolean
  /** Additional className */
  className?: string
  /** Click handler for cluster badge */
  onClusterClick?: () => void
  /** Click handler for namespace badge */
  onNamespaceClick?: () => void
  /** Click handler for kind badge */
  onKindClick?: () => void
}

/**
 * Resource badges component for modals
 *
 * Displays cluster, namespace, and resource kind badges in a consistent format.
 * Badges can be clickable to navigate to related resources.
 *
 * @example
 * ```tsx
 * <ResourceBadges
 *   resource={{
 *     kind: 'Pod',
 *     name: 'my-pod',
 *     namespace: 'default',
 *     cluster: 'prod-cluster',
 *   }}
 *   onClusterClick={() => drillToCluster('prod-cluster')}
 * />
 * ```
 */
export function ResourceBadges({
  resource,
  size = 'sm',
  showCluster = true,
  showNamespace = true,
  showKind = true,
  showIcons = true,
  className = '',
  onClusterClick,
  onNamespaceClick,
  onKindClick,
}: ResourceBadgesProps) {
  const { t: _t } = useTranslation()
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {/* Cluster badge */}
      {showCluster && resource.cluster && (
        onClusterClick ? (
          <button
            onClick={onClusterClick}
            className="hover:opacity-80 transition-opacity"
          >
            <ClusterBadge
              cluster={resource.cluster}
              size={size}
              showIcon={showIcons}
            />
          </button>
        ) : (
          <ClusterBadge
            cluster={resource.cluster}
            size={size}
            showIcon={showIcons}
          />
        )
      )}

      {/* Namespace badge */}
      {showNamespace && resource.namespace && (
        <NamespaceBadge
          namespace={resource.namespace}
          size={size}
          showIcon={showIcons}
          onClick={onNamespaceClick}
        />
      )}

      {/* Resource kind badge */}
      {showKind && (
        <ResourceKindBadge
          kind={resource.kind}
          size={size}
          showIcon={showIcons}
          onClick={onKindClick}
        />
      )}
    </div>
  )
}

interface NamespaceBadgeProps {
  namespace: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
  onClick?: () => void
}

export function NamespaceBadge({
  namespace,
  size = 'sm',
  showIcon = true,
  className = '',
  onClick,
}: NamespaceBadgeProps) {
  const sizeClasses = {
    sm: onClick ? 'text-[10px] px-2 py-1.5 min-h-11 min-w-11' : 'text-[10px] px-1.5 py-0.5',
    md: onClick ? 'text-xs px-2.5 py-2 min-h-11 min-w-11' : 'text-xs px-2 py-0.5',
    lg: onClick ? 'text-sm px-3 py-2 min-h-11 min-w-11' : 'text-sm px-2.5 py-1',
  }

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-medium bg-indigo-500/20 text-indigo-400 border-indigo-500/30 ${sizeClasses[size]} ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${className}`}
      title={`Namespace: ${namespace}`}
      onClick={onClick}
    >
      {showIcon && <FolderTree className={iconSizes[size]} />}
      {namespace}
    </span>
  )
}

interface ResourceKindBadgeProps {
  kind: ResourceKind
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
  onClick?: () => void
}

export function ResourceKindBadge({
  kind,
  size = 'sm',
  showIcon = true,
  className = '',
  onClick,
}: ResourceKindBadgeProps) {
  const Icon = RESOURCE_ICONS[kind] || File
  const colors = RESOURCE_COLORS[kind] || DEFAULT_COLORS

  const sizeClasses = {
    sm: onClick ? 'text-[10px] px-2 py-1.5 min-h-11 min-w-11' : 'text-[10px] px-1.5 py-0.5',
    md: onClick ? 'text-xs px-2.5 py-2 min-h-11 min-w-11' : 'text-xs px-2 py-0.5',
    lg: onClick ? 'text-sm px-3 py-2 min-h-11 min-w-11' : 'text-sm px-2.5 py-1',
  }

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-medium ${colors.bg} ${colors.text} ${colors.border} ${sizeClasses[size]} ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${className}`}
      title={`Resource: ${kind}`}
      onClick={onClick}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {kind}
    </span>
  )
}

/**
 * Get icon component for a resource kind
 */
export function getResourceIcon(kind: ResourceKind): typeof Box {
  return RESOURCE_ICONS[kind] || File
}

/**
 * Get colors for a resource kind
 */
export function getResourceColors(kind: ResourceKind): { bg: string; text: string; border: string } {
  return RESOURCE_COLORS[kind] || DEFAULT_COLORS
}

// Re-export ClusterBadge with onClick support
export { ClusterBadge }
