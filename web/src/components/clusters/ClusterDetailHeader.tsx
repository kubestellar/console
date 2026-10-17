import { WifiOff, CheckCircle, AlertTriangle, X, Pencil, Trash2, Server, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import { CloudProviderIcon, detectCloudProvider as detectCloudProviderShared, getProviderLabel, getConsoleUrl, type CloudProvider as CloudProviderType } from '../ui/CloudProviderIcon'
import { getProviderInfo, type ClusterDetailCloudProvider } from './utils'
import { type ClusterInfo, type ClusterHealth } from '../../hooks/useMCP'

// ─── ClusterDetailHeader ─────────────────────────────────────────────────────

interface ClusterDetailHeaderProps {
  clusterName: string
  clusterUser?: string
  clusterInfo: ClusterInfo | undefined
  health: ClusterHealth | null | undefined
  isUnreachable: boolean
  isHealthy: boolean
  aliasList: string[]
  headerAliasSummary: string
  serverAddress: string | undefined
  onClose: () => void
  onRename?: (clusterName: string) => void
  onRemove?: (clusterName: string) => void
}

export function ClusterDetailHeader({
  clusterName,
  clusterUser,
  clusterInfo,
  health,
  isUnreachable,
  isHealthy,
  aliasList,
  headerAliasSummary,
  serverAddress,
  onClose,
  onRename,
  onRemove,
}: ClusterDetailHeaderProps) {
  const { t } = useTranslation()

  const serverUrl = clusterInfo?.server || health?.apiServer
  const detectedProvider =
    (clusterInfo?.distribution as CloudProviderType) ||
    detectCloudProviderShared(clusterName, serverUrl, clusterInfo?.namespaces, clusterUser)
  const consoleUrl = getConsoleUrl(detectedProvider, clusterName, serverUrl)
  const providerInfo = getProviderInfo(
    detectedProvider === 'kubernetes' ? 'unknown' : (detectedProvider as ClusterDetailCloudProvider),
  )
  const providerLabel = getProviderLabel(detectedProvider)

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {isUnreachable ? (
          <StatusBadge color="yellow" icon={<WifiOff className="w-4 h-4" />} className="px-2 py-1" />
        ) : isHealthy ? (
          <StatusBadge color="green" icon={<CheckCircle className="w-4 h-4" />} className="px-2 py-1" />
        ) : (
          <StatusBadge color="red" icon={<AlertTriangle className="w-4 h-4" />} className="px-2 py-1" />
        )}
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold text-foreground">{clusterName.split('/').pop()}</h2>
          {aliasList.length > 0 && (
            <div
              className="text-xs text-muted-foreground mt-0.5"
              title={t('clusterDetail.alsoKnownAs', { aliases: (aliasList || []).join(', ') })}
            >
              {t('clusterDetail.akaLabel')} {headerAliasSummary}
            </div>
          )}
          {serverAddress && (
            <div
              className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"
              data-testid="cluster-detail-server-address"
              title={`${t('clusterDetail.serverAddress')}: ${serverAddress}`}
            >
              <Server className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-xs">{serverAddress}</span>
            </div>
          )}
        </div>
        {consoleUrl ? (
          <a
            href={sanitizeUrl(consoleUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium ${providerInfo.bgColor} ${providerInfo.color} hover:opacity-80 transition-opacity`}
            title={t('clusterDetail.openConsole', { provider: providerLabel })}
          >
            <CloudProviderIcon provider={detectedProvider} size={16} />
            {providerLabel}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium ${providerInfo.bgColor} ${providerInfo.color}`}
            title={providerLabel}
          >
            <CloudProviderIcon provider={detectedProvider} size={16} />
            {providerLabel}
          </span>
        )}
        {onRename && (
          <button
            onClick={() => onRename(clusterName)}
            className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            title={t('clusterDetail.renameCluster')}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {onRemove && isUnreachable && (clusterInfo?.source === 'kubeconfig' || !clusterInfo?.source) && (
          <button
            onClick={() => onRemove(clusterName)}
            className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
            title={t('cluster.removeCluster')}
            aria-label={t('cluster.removeCluster')}
            data-testid="cluster-detail-remove-button"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <button aria-label={t('actions.close')} onClick={onClose} className="text-muted-foreground hover:text-foreground">
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}
