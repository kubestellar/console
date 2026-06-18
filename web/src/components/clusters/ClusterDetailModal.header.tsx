import { X, CheckCircle, AlertTriangle, WifiOff, Pencil, Trash2, Stethoscope, Wrench, Wand2, Bot, ExternalLink, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type ClusterInfo, type ClusterHealth, type PodIssue, type DeploymentIssue } from '../../hooks/useMCP'
import { CloudProviderIcon, detectCloudProvider as detectCloudProviderShared, getProviderLabel, getConsoleUrl, CloudProvider as CloudProviderType } from '../ui/CloudProviderIcon'
import { StatusBadge } from '../ui/StatusBadge'
import { Button } from '../ui/Button'
import { ClusterStatusDetails } from './ClusterStatusDetails'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'

// Cloud provider types
type CloudProvider = 'eks' | 'gke' | 'aks' | 'openshift' | 'oci' | 'alibaba' | 'digitalocean' | 'rancher' | 'coreweave' | 'kind' | 'minikube' | 'k3s' | 'unknown'

function getProviderInfo(provider: CloudProvider): { color: string; bgColor: string } {
  switch (provider) {
    case 'eks': return { color: 'text-orange-400', bgColor: 'bg-orange-500/20' }
    case 'gke': return { color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
    case 'aks': return { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' }
    case 'openshift': return { color: 'text-red-400', bgColor: 'bg-red-500/20' }
    case 'oci': return { color: 'text-red-500', bgColor: 'bg-red-500/20' }
    case 'alibaba': return { color: 'text-orange-300', bgColor: 'bg-orange-500/20' }
    case 'digitalocean': return { color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
    case 'rancher': return { color: 'text-green-400', bgColor: 'bg-green-500/20' }
    case 'coreweave': return { color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
    case 'kind': return { color: 'text-blue-300', bgColor: 'bg-blue-500/20' }
    case 'minikube': return { color: 'text-purple-400', bgColor: 'bg-purple-500/20' }
    case 'k3s': return { color: 'text-green-300', bgColor: 'bg-green-500/20' }
    default: return { color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
  }
}

interface ClusterDetailHeaderProps {
  clusterName: string
  clusterUser?: string
  clusterInfo: ClusterInfo | undefined
  health: ClusterHealth | undefined
  healthError: string | null | undefined
  isUnreachable: boolean
  isHealthy: boolean
  aliasList: string[]
  serverAddress: string | undefined
  headerAliasSummary: string
  onClose: () => void
  onRename?: (clusterName: string) => void
  onRemove?: (clusterName: string) => void
  handleDiagnose: () => void
  handleRepair: () => void
  handleAsk: () => void
  podIssues: PodIssue[]
  clusterDeploymentIssues: DeploymentIssue[]
}

export function ClusterDetailHeader({
  clusterName, clusterUser, clusterInfo, health, healthError,
  isUnreachable, isHealthy, aliasList, serverAddress, headerAliasSummary,
  onClose, onRename, onRemove, handleDiagnose, handleRepair, handleAsk,
  podIssues, clusterDeploymentIssues,
}: ClusterDetailHeaderProps) {
  const { t } = useTranslation()

  const serverUrl = clusterInfo?.server || health?.apiServer
  const detectedProvider = clusterInfo?.distribution as CloudProviderType ||
    detectCloudProviderShared(clusterName, serverUrl, clusterInfo?.namespaces, clusterUser)
  const consoleUrl = getConsoleUrl(detectedProvider, clusterName, serverUrl)
  const providerInfo = getProviderInfo(detectedProvider === 'kubernetes' ? 'unknown' : detectedProvider as CloudProvider)
  const providerLabel = getProviderLabel(detectedProvider)

  return (
    <>
      {/* Header row */}
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
              <div className="text-xs text-muted-foreground mt-0.5" title={t('clusterDetail.alsoKnownAs', { aliases: (aliasList || []).join(', ') })}>
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

      {/* Error banner */}
      {healthError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{healthError}</span>
        </div>
      )}

      {/* Status details */}
      {clusterInfo && (
        <ClusterStatusDetails cluster={clusterInfo} className="mb-4" />
      )}

      {/* Remove offline affordance */}
      {onRemove && isUnreachable && (clusterInfo?.source === 'kubeconfig' || !clusterInfo?.source) && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <WifiOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground mb-1">
              {t('clusterDetail.offlineRemoveTitle')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('clusterDetail.offlineRemoveDesc')}
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onRemove(clusterName)}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            data-testid="cluster-detail-remove-cta"
          >
            {t('cluster.removeCluster')}
          </Button>
        </div>
      )}

      {/* AI Actions */}
      <div className="mb-6 p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-medium text-foreground">{t('clusterDetail.aiAssistant')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDiagnose}
            disabled={isUnreachable}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('clusterDetail.diagnoseTitle')}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            {t('clusterDetail.diagnose')}
          </button>
          <button
            onClick={handleRepair}
            disabled={isUnreachable || (podIssues.length === 0 && clusterDeploymentIssues.length === 0)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={podIssues.length === 0 && clusterDeploymentIssues.length === 0 ? t('clusterDetail.noIssuesToRepair') : t('clusterDetail.repairTitle')}
          >
            <Wrench className="w-3.5 h-3.5" />
            {t('clusterDetail.repair')}
            {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
              <StatusBadge color="red" size="xs">
                {podIssues.length + clusterDeploymentIssues.length}
              </StatusBadge>
            )}
          </button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleAsk}
            disabled={isUnreachable}
            icon={<Wand2 className="w-3.5 h-3.5" />}
            title={t('clusterDetail.askTitle')}
          >
            {t('clusterDetail.ask')}
          </Button>
        </div>
      </div>
    </>
  )
}
