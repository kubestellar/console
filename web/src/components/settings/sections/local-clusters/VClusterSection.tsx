import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Loader2, Trash2, Plug, Unplug, Bot } from 'lucide-react'
import { VClusterActionBanner } from './VClusterActionBanner'
import type { VClusterActionFeedback, VClusterInstance, VClusterClusterStatus } from '../../../../hooks/useLocalClusterTools'

/** Default namespace for new vCluster instances */
const VCLUSTER_DEFAULT_NAMESPACE = 'vcluster'

interface ClusterInfo {
  name: string
  context?: string
}

interface VClusterSectionProps {
  vclusterInstances: VClusterInstance[]
  vclusterClusterStatus: VClusterClusterStatus[]
  healthyClusters: ClusterInfo[]
  isCreating: boolean
  isConnecting: string | null
  isDisconnecting: string | null
  isDeleting: string | null
  vclusterActionFeedback: VClusterActionFeedback | null
  dismissVClusterActionFeedback: () => void
  checkVClusterOnCluster: (context: string) => void
  createVCluster: (name: string, namespace: string) => Promise<void>
  connectVCluster: (name: string, namespace: string) => Promise<void>
  disconnectVCluster: (name: string, namespace: string) => Promise<void>
  onDeleteVCluster: (name: string, namespace: string) => void
  onInstallVClusterOnCluster: (context: string) => void
}

export function VClusterSection({
  vclusterInstances,
  vclusterClusterStatus,
  healthyClusters,
  isCreating,
  isConnecting,
  isDisconnecting,
  isDeleting,
  vclusterActionFeedback,
  dismissVClusterActionFeedback,
  checkVClusterOnCluster,
  createVCluster,
  connectVCluster,
  disconnectVCluster,
  onDeleteVCluster,
  onInstallVClusterOnCluster,
}: VClusterSectionProps) {
  const { t } = useTranslation()
  const [vclusterName, setVclusterName] = useState('')
  const [vclusterNamespace, setVclusterNamespace] = useState(VCLUSTER_DEFAULT_NAMESPACE)
  const [vclusterHostCluster, setVclusterHostCluster] = useState('')

  const handleCreateVCluster = async () => {
    if (!vclusterName.trim()) return
    await createVCluster(vclusterName.trim(), vclusterNamespace.trim() || VCLUSTER_DEFAULT_NAMESPACE)
    setVclusterName('')
    setVclusterNamespace(VCLUSTER_DEFAULT_NAMESPACE)
  }

  const handleConnectVCluster = async (name: string, namespace: string) => {
    await connectVCluster(name, namespace)
  }

  const handleDisconnectVCluster = async (name: string, namespace: string) => {
    await disconnectVCluster(name, namespace)
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
              onChange={(e) => { setVclusterHostCluster(e.target.value); if (e.target.value) checkVClusterOnCluster(e.target.value) }}
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
              onClick={handleCreateVCluster}
              disabled={!vclusterName.trim() || !vclusterHostCluster || isCreating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    {/* Connect / Disconnect button */}
                    {instance.connected ? (
                      <button
                        onClick={() => handleDisconnectVCluster(instance.name, instance.namespace)}
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
                        onClick={() => handleConnectVCluster(instance.name, instance.namespace)}
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
                    {/* Delete button */}
                    <button
                      onClick={() => onDeleteVCluster(instance.name, instance.namespace)}
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
