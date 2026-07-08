import { ChevronDown, ChevronRight, WifiOff, Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../ui/ClusterBadge'
import { NamespaceCard, NamespaceCardSkeleton } from './NamespaceCard'
import type { NamespaceDetails } from './types'

type ClusterNamespaceStatus = 'unavailable' | 'accessDenied'

interface NamespaceClusterGroupProps {
  clusterName: string
  namespaces: NamespaceDetails[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  isLoading: boolean
  clusterStatus?: ClusterNamespaceStatus
  hasData: boolean
  isUnreachable: boolean
  selectedNamespace: NamespaceDetails | null
  onSelect: (ns: NamespaceDetails) => void
  onDelete: (ns: NamespaceDetails) => void
}

export function NamespaceClusterGroup({
  clusterName,
  namespaces,
  isCollapsed,
  onToggleCollapse,
  isLoading,
  clusterStatus,
  hasData,
  isUnreachable,
  selectedNamespace,
  onSelect,
  onDelete
}: NamespaceClusterGroupProps) {
  const { t } = useTranslation()

  return (
    <div>
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 w-full text-left mb-2 group"
        title={isCollapsed ? 'Expand cluster' : isUnreachable ? `Cluster offline - check network connection` : 'Collapse cluster'}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${clusterName}`}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
        )}
        <ClusterBadge cluster={clusterName} size="sm" />
        {isUnreachable && (
          <span title="Cluster offline">
            <WifiOff className="w-4 h-4 text-yellow-400" />
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          {isUnreachable ? (
            <span className="text-yellow-400">offline</span>
          ) : clusterStatus === 'accessDenied' && !hasData ? (
            t('namespaces.status.accessDenied', { defaultValue: 'Access denied' })
          ) : clusterStatus === 'unavailable' && !hasData ? (
            t('namespaces.status.unavailable', { defaultValue: 'Data unavailable' })
          ) : isLoading && !hasData ? (
            <span className="flex items-center gap-1.5">
              <Hourglass className="w-3 h-3 animate-pulse" />
              loading...
            </span>
          ) : (
            `${namespaces.length} namespace${namespaces.length !== 1 ? 's' : ''}`
          )}
        </span>
      </button>

      {!isCollapsed && (
        <div className="space-y-2 ml-6">
          {isLoading && !hasData && !isUnreachable ? (
            [1, 2, 3].map((i) => (
              <NamespaceCardSkeleton key={`${clusterName}-skeleton-${i}`} />
            ))
          ) : namespaces.length > 0 ? (
            namespaces.map(ns => {
              const isSystem = ns.name.startsWith('kube-') ||
                ns.name.startsWith('openshift-') ||
                ns.name === 'default'
              return (
                <NamespaceCard
                  key={`${ns.cluster}-${ns.name}`}
                  namespace={ns}
                  isSelected={selectedNamespace?.name === ns.name && selectedNamespace?.cluster === ns.cluster}
                  onSelect={() => onSelect(ns)}
                  onDelete={!isSystem ? () => onDelete(ns) : undefined}
                  isSystem={isSystem}
                  showCluster={false}
                />
              )
            })
          ) : clusterStatus === 'accessDenied' ? (
            <p className="text-sm text-yellow-400 py-2">
              {t('namespaces.errors.authorizationFailed', 'Authorization failed for namespace access. Your credentials may lack permission to list namespaces on the connected clusters.')}
            </p>
          ) : clusterStatus === 'unavailable' ? (
            <p className="text-sm text-muted-foreground py-2">
              {t('namespaces.status.unavailableMessage', {
                defaultValue: 'Namespace data is unavailable for this cluster. Try refreshing or check cluster connectivity.'
              })}
            </p>
          ) : hasData ? (
            <p className="text-sm text-muted-foreground py-2">No namespaces found</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
