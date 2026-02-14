import { ChevronRight, ChevronLeft } from 'lucide-react'
import type { Breadcrumb, NavigationTarget } from '../types/modal.types'
import { getStatusColors } from '../types/modal.types'
import { useTranslation } from 'react-i18next'

interface BreadcrumbNavProps {
  /** Breadcrumb items to display */
  breadcrumbs: Breadcrumb[]
  /** Handler when a breadcrumb is clicked */
  onNavigate?: (target: NavigationTarget) => void
  /** Handler for back button (navigates to previous breadcrumb) */
  onBack?: () => void
  /** Whether to show the back button */
  showBackButton?: boolean
  /** Maximum number of breadcrumbs to show before collapsing */
  maxVisible?: number
  /** Status to show as badge on last breadcrumb */
  status?: string
  /** Additional className */
  className?: string
}

/**
 * Breadcrumb navigation component for modals
 *
 * Shows clickable navigation path through nested resources.
 * Supports collapsing long paths and showing status badges.
 *
 * @example
 * ```tsx
 * <BreadcrumbNav
 *   breadcrumbs={[
 *     { id: 'cluster', label: 'prod-cluster', kind: 'Cluster', context: { cluster: 'prod' } },
 *     { id: 'ns', label: 'kube-system', kind: 'Namespace', context: { namespace: 'kube-system' } },
 *     { id: 'pod', label: 'coredns-abc123', kind: 'Pod', context: { name: 'coredns-abc123' } },
 *   ]}
 *   onNavigate={handleNavigate}
 *   status="Running"
 * />
 * ```
 */
export function BreadcrumbNav({
  breadcrumbs,
  onNavigate,
  onBack,
  showBackButton = true,
  maxVisible = 4,
  status,
  className = '',
}: BreadcrumbNavProps) {
  const { t: _t } = useTranslation()
  if (breadcrumbs.length === 0) {
    return null
  }

  // Determine which breadcrumbs to show
  const shouldCollapse = breadcrumbs.length > maxVisible
  const visibleBreadcrumbs = shouldCollapse
    ? [
        breadcrumbs[0], // Always show first
        null, // Placeholder for ellipsis
        ...breadcrumbs.slice(-Math.min(maxVisible - 1, breadcrumbs.length - 1)),
      ]
    : breadcrumbs

  const handleBreadcrumbClick = (breadcrumb: Breadcrumb) => {
    if (breadcrumb.onClick) {
      breadcrumb.onClick()
    } else if (onNavigate && breadcrumb.context) {
      onNavigate(breadcrumb.context as NavigationTarget)
    }
  }

  const handleBackClick = () => {
    if (onBack) {
      onBack()
    } else if (onNavigate && breadcrumbs.length > 1) {
      const previousBreadcrumb = breadcrumbs[breadcrumbs.length - 2]
      onNavigate(previousBreadcrumb.context as NavigationTarget)
    }
  }

  return (
    <div className={`flex items-center gap-1 min-w-0 ${className}`}>
      {/* Back button */}
      {showBackButton && breadcrumbs.length > 1 && (
        <button
          onClick={handleBackClick}
          className="p-1.5 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title="Go back (Backspace)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
        {visibleBreadcrumbs.map((breadcrumb, index) => {
          // Handle ellipsis placeholder
          if (breadcrumb === null) {
            return (
              <div key="ellipsis" className="flex items-center gap-0.5 shrink-0">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground text-sm px-1">...</span>
              </div>
            )
          }

          const isLast = index === visibleBreadcrumbs.length - 1
          const Icon = breadcrumb.icon

          return (
            <div key={breadcrumb.id} className="flex items-center gap-0.5 shrink-0">
              {index > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <button
                onClick={() => handleBreadcrumbClick(breadcrumb)}
                className={`px-1.5 py-0.5 rounded text-sm transition-colors flex items-center gap-1 max-w-[150px] ${
                  isLast
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                }`}
                title={breadcrumb.label}
              >
                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{breadcrumb.label}</span>
              </button>

              {/* Status badge on last item */}
              {isLast && status && (
                <StatusBadge status={status} />
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const colors = getStatusColors(status)
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2 py-0.5 text-sm'

  return (
    <span
      className={`rounded font-medium ${sizeClasses} ${colors.bg} ${colors.text}`}
      title={`Status: ${status}`}
    >
      {status}
    </span>
  )
}

/**
 * Simple breadcrumb separator
 */
export function BreadcrumbSeparator() {
  return <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
}

/**
 * Convert drill-down stack to breadcrumbs
 */
export function stackToBreadcrumbs(
  stack: Array<{ type: string; title: string; data: Record<string, unknown> }>
): Breadcrumb[] {
  return stack.map((view, index) => ({
    id: `${view.type}-${index}`,
    label: view.title,
    kind: typeToKind(view.type),
    context: {
      kind: typeToKind(view.type),
      name: view.title,
      cluster: view.data.cluster as string,
      namespace: view.data.namespace as string | undefined,
      data: view.data,
    },
  }))
}

function typeToKind(type: string): Breadcrumb['kind'] {
  const typeMap: Record<string, Breadcrumb['kind']> = {
    cluster: 'Cluster',
    namespace: 'Namespace',
    node: 'Node',
    pod: 'Pod',
    deployment: 'Deployment',
    replicaset: 'ReplicaSet',
    service: 'Service',
    configmap: 'ConfigMap',
    secret: 'Secret',
    pvc: 'PersistentVolumeClaim',
    job: 'Job',
    hpa: 'HorizontalPodAutoscaler',
    'gpu-node': 'Node',
  }
  return typeMap[type] || 'Custom'
}
