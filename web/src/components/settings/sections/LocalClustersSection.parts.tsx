import { Loader2, Plus, Bot, Plug, Unplug, Trash2, Check, AlertCircle, Monitor, ExternalLink } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { VClusterInstance, VClusterClusterStatus, VClusterActionFeedback } from '../../../hooks/useLocalClusterTools'
import type { ClusterInfo } from '../../../hooks/mcp/types'
import { VClusterActionBanner } from './VClusterActionBanner'

/** Namespace where KubeVirt is typically installed */
const KUBEVIRT_NAMESPACE = 'kubevirt'

// ------------------------------------------------------------------
// VClusterSection
// ------------------------------------------------------------------

interface VClusterSectionProps {
  hasVClusterTool: boolean
  vclusterHostCluster: string
  onSetVclusterHostCluster: (value: string) => void
  vclusterNamespace: string
  setVclusterNamespace: (value: string) => void
  vclusterName: string
  setVclusterName: (value: string) => void
  healthyClusters: ClusterInfo[]
  vclusterInstances: VClusterInstance[]
  vclusterClusterStatus: VClusterClusterStatus[]
  vclusterActionFeedback: VClusterActionFeedback | null
  dismissVClusterActionFeedback: () => void
  isCreating: boolean
  isConnecting: string | null
  isDisconnecting: string | null
  isDeleting: string | null
  onCreateVCluster: () => Promise<void>
  onConnectVCluster: (name: string, namespace: string) => Promise<void>
  onDisconnectVCluster: (name: string, namespace: string) => Promise<void>
  onDeleteVClusterRequest: (confirm: { name: string; namespace: string }) => void
  onInstallVClusterCLI: () => void
  onInstallVClusterOnCluster: (clusterContext: string) => void
  t: TFunction
}

export function VClusterSection({
  hasVClusterTool,
  vclusterHostCluster,
  onSetVclusterHostCluster,
  vclusterNamespace,
  setVclusterNamespace,
  vclusterName,
  setVclusterName,
  healthyClusters,
  vclusterInstances,
  vclusterClusterStatus,
  vclusterActionFeedback,
  dismissVClusterActionFeedback,
  isCreating,
  isConnecting,
  isDisconnecting,
  isDeleting,
  onCreateVCluster,
  onConnectVCluster,
  onDisconnectVCluster,
  onDeleteVClusterRequest,
  onInstallVClusterCLI,
  onInstallVClusterOnCluster,
  t,
}: VClusterSectionProps) {
  if (!hasVClusterTool) {
    return (
      <div className="mt-6 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <div className="flex items-center gap-2 text-purple-400 mb-2">
          <span className="text-xl">🔮</span>
          <span className="font-medium">{t('settings.localClusters.vclusterInstallTitle')}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {t('settings.localClusters.vclusterInstallDesc')}
        </p>
        <ul className="mb-3 space-y-1 text-sm text-muted-foreground">
          <li><code className="px-1 bg-secondary rounded">brew install loft-sh/tap/vcluster</code></li>
          <li><code className="px-1 bg-secondary rounded">curl -L -o vcluster https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-...</code></li>
        </ul>
        <button
          onClick={onInstallVClusterCLI}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
        >
          <Bot className="w-4 h-4" />
          {t('settings.localClusters.vclusterInstallWithAgent')}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🔮</span>
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('settings.localClusters.vclusterSection')}
        </h3>
        <span className="text-xs text-muted-foreground">
          — {t('settings.localClusters.vclusterDesc')}
        </span>
      </div>

      <VClusterActionBanner
        feedback={vclusterActionFeedback}
        onDismiss={dismissVClusterActionFeedback}
      />

      {/* Create vCluster Form */}
      <div className="mb-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {t('settings.localClusters.vclusterCreateNew')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="vcluster-host-cluster" className="text-xs text-muted-foreground font-medium">Host Cluster</label>
            <select
              id="vcluster-host-cluster"
              value={vclusterHostCluster}
              onChange={(e) => onSetVclusterHostCluster(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="" disabled>{t('settings.localClusters.selectHostCluster')}</option>
              {(healthyClusters || []).map(c => {
                const vcStatus = (vclusterClusterStatus || []).find(s => s.context === (c.context || c.name))
                const hasVC = vcStatus?.hasCRD
                return (
                  <option key={c.context || c.name} value={c.context || c.name}>
                    {c.name}{hasVC ? ` (🔮 v${vcStatus?.version || '?'}, ${vcStatus?.instances || 0} instances)` : ''}{c.context && c.context !== c.name ? ` — ${c.context}` : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="flex flex-col gap-1 justify-end">
            {(() => {
              const vcStatus = (vclusterClusterStatus || []).find(s => s.context === vclusterHostCluster)
              const displayName = (healthyClusters || []).find(c => (c.context || c.name) === vclusterHostCluster)?.name || vclusterHostCluster
              if (vcStatus?.hasCRD) {
                return (
                  <span className="flex items-center gap-2 px-3 py-2 text-xs text-purple-400 font-medium">
                    🔮 vCluster v{vcStatus.version || '?'} ready ({vcStatus.instances} instance{vcStatus.instances !== 1 ? 's' : ''})
                  </span>
                )
              }
              return (
                <button
                  onClick={() => onInstallVClusterOnCluster(vclusterHostCluster)}
                  disabled={!vclusterHostCluster}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-medium hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Bot className="w-3.5 h-3.5" />
                  {vclusterHostCluster ? `Deploy vCluster to ${displayName}` : 'Select a cluster first'}
                </button>
              )
            })()}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="vcluster-namespace" className="text-xs text-muted-foreground font-medium">Namespace</label>
            <input
              id="vcluster-namespace"
              type="text"
              value={vclusterNamespace}
              onChange={(e) => setVclusterNamespace(e.target.value)}
              placeholder={t('settings.localClusters.vclusterDefaultNamespace')}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="vcluster-name" className="text-xs text-muted-foreground font-medium">vCluster Name</label>
            <input
              id="vcluster-name"
              type="text"
              value={vclusterName}
              onChange={(e) => setVclusterName(e.target.value)}
              placeholder="my-vcluster"
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={onCreateVCluster}
              disabled={!vclusterName.trim() || !vclusterHostCluster || isCreating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('settings.localClusters.creating')}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  {t('settings.localClusters.create')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* vCluster Instances List */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          {t('settings.localClusters.vclusterCount', { count: (vclusterInstances || []).length })}
        </h3>
        {(vclusterInstances || []).length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 bg-secondary/30 rounded-lg">
            {t('settings.localClusters.noClusters')}
          </p>
        ) : (
          <div className="space-y-2">
            {(vclusterInstances || []).map((instance) => {
              const isRunning = instance.status === 'Running'
              const isPaused = instance.status === 'Paused'
              return (
                <div
                  key={`vcluster-${instance.namespace}-${instance.name}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🔮</span>
                    <div>
                      <p className="font-medium text-foreground">{instance.name}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {t('settings.localClusters.vclusterNamespace')}: {instance.namespace}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            isRunning ? 'bg-green-500' :
                            isPaused ? 'bg-yellow-500' :
                            'bg-orange-500'
                          }`} />
                          <span className={
                            isRunning ? 'text-green-400' :
                            isPaused ? 'text-yellow-400' :
                            'text-orange-400'
                          }>
                            {isPaused ? t('settings.localClusters.vclusterPaused') : instance.status}
                          </span>
                        </div>
                        {instance.connected && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-green-400 flex items-center gap-1">
                              <Plug className="w-3 h-3" />
                              {t('settings.localClusters.vclusterConnected')}
                            </span>
                          </>
                        )}
                        {instance.connected && instance.context && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <code className="px-1 bg-secondary rounded text-muted-foreground">{instance.context}</code>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {instance.connected ? (
                      <button
                        onClick={() => onDisconnectVCluster(instance.name, instance.namespace)}
                        disabled={isDisconnecting === instance.name}
                        aria-label={t('settings.localClusters.vclusterDisconnect')}
                        className="p-2 rounded-lg text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 disabled:opacity-50"
                        title={t('settings.localClusters.vclusterDisconnect')}
                      >
                        {isDisconnecting === instance.name ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Unplug className="w-4 h-4" />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => onConnectVCluster(instance.name, instance.namespace)}
                        disabled={isConnecting === instance.name}
                        aria-label={t('settings.localClusters.vclusterConnect')}
                        className="p-2 rounded-lg text-muted-foreground hover:text-green-400 hover:bg-green-500/10 disabled:opacity-50"
                        title={t('settings.localClusters.vclusterConnect')}
                      >
                        {isConnecting === instance.name ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plug className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteVClusterRequest({ name: instance.name, namespace: instance.namespace })}
                      disabled={isDeleting === instance.name}
                      aria-label={t('settings.localClusters.deleteVcluster', { name: instance.name, defaultValue: `Delete vCluster ${instance.name}` })}
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      title="Delete vCluster"
                    >
                      {isDeleting === instance.name ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// KubeVirtSection
// ------------------------------------------------------------------

interface KubeVirtSectionProps {
  healthyClusters: ClusterInfo[]
  onInstallKubeVirtOnCluster: (clusterContext: string) => void
  onNavigateToMission: () => void
  t: TFunction
}

export function KubeVirtSection({ healthyClusters, onInstallKubeVirtOnCluster, onNavigateToMission, t }: KubeVirtSectionProps) {
  const kubevirtClusters = (healthyClusters || []).filter(c =>
    (c.namespaces || []).includes(KUBEVIRT_NAMESPACE),
  )
  const hasKubevirtAnywhere = kubevirtClusters.length > 0

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <Monitor className="w-5 h-5 text-cyan-400" />
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('settings.localClusters.kubevirtSection')}
        </h3>
        <span className="text-xs text-muted-foreground">
          — {t('settings.localClusters.kubevirtDesc')}
        </span>
      </div>

      {/* Per-cluster KubeVirt status */}
      {healthyClusters.length > 0 ? (
        <div className="space-y-2 mb-4">
          {(healthyClusters || []).map(c => {
            const context = c.context || c.name
            const hasKubevirt = (c.namespaces || []).includes(KUBEVIRT_NAMESPACE)
            return (
              <div
                key={`kubevirt-${context}`}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
              >
                <div className="flex items-center gap-3">
                  <Monitor className="w-4 h-4 text-cyan-400" />
                  <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    <div className="flex items-center gap-2 text-xs">
                      {c.context && c.context !== c.name && (
                        <>
                          <code className="px-1 bg-secondary rounded text-muted-foreground">{c.context}</code>
                          <span className="text-muted-foreground">•</span>
                        </>
                      )}
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${hasKubevirt ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                        <span className={hasKubevirt ? 'text-green-400' : 'text-muted-foreground'}>
                          {hasKubevirt
                            ? t('settings.localClusters.kubevirtInstalled')
                            : t('settings.localClusters.kubevirtNotInstalled')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {!hasKubevirt && (
                  <button
                    onClick={() => onInstallKubeVirtOnCluster(context)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {t('settings.localClusters.kubevirtInstallOnCluster')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground p-4 bg-secondary/30 rounded-lg mb-4">
          {t('settings.localClusters.kubevirtNoClusters')}
        </p>
      )}

      {/* Summary and mission link */}
      <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
        {hasKubevirtAnywhere ? (
          <div className="flex items-center gap-2 text-cyan-400 mb-2">
            <Check className="w-4 h-4" />
            <span className="font-medium">
              {t('settings.localClusters.kubevirtDetectedCount', { count: kubevirtClusters.length })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-cyan-400 mb-2">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{t('settings.localClusters.kubevirtNotDetected')}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-3">
          {t('settings.localClusters.kubevirtInstallHint')}
        </p>
        <button
          onClick={onNavigateToMission}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {t('settings.localClusters.kubevirtOpenMission')}
        </button>
      </div>
    </div>
  )
}
