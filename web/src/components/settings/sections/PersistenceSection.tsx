import { useState, useEffect } from 'react'
import { Database, RefreshCw, Check, X, AlertCircle, Loader2 } from 'lucide-react'
import { usePersistence, type PersistenceConfig, type ClusterHealth } from '../../../hooks/usePersistence'
import { useClusters } from '../../../hooks/mcp/clusters'

interface ClusterInfo {
  name: string
  healthy?: boolean
}

export function PersistenceSection() {
  const {
    config,
    status,
    loading,
    error,
    syncing,
    updateConfig,
    testConnection,
    syncNow,
    isEnabled,
    isActive,
  } = usePersistence()

  const { clusters } = useClusters()
  const [localConfig, setLocalConfig] = useState<PersistenceConfig>(config)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ cluster: string; success: boolean } | null>(null)

  // Update local config when remote config changes
  useEffect(() => {
    setLocalConfig(config)
  }, [config])

  const handleSave = async () => {
    const success = await updateConfig(localConfig)
    if (success) {
      setTestResult(null)
    }
  }

  const handleTest = async (cluster: string) => {
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(cluster)
    setTestResult({ cluster, success: result.success })
    setTesting(false)
  }

  const handleSync = async () => {
    await syncNow()
  }

  const getHealthIcon = (health: ClusterHealth) => {
    switch (health) {
      case 'healthy':
        return <Check className="w-4 h-4 text-green-500" />
      case 'degraded':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      case 'unreachable':
        return <X className="w-4 h-4 text-red-500" />
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />
    }
  }

  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(config)

  if (loading) {
    return (
      <div id="persistence-settings" className="glass rounded-xl p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div id="persistence-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-secondary">
            <Database className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">Deploy Persistence</h2>
            <p className="text-sm text-muted-foreground">
              Store workloads, groups, and deployments as Kubernetes CRs
            </p>
          </div>
        </div>
        {isEnabled && isActive && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 mb-4">
        <div>
          <p className="text-sm font-medium text-foreground">Enable Persistence</p>
          <p className="text-xs text-muted-foreground">
            Store Deploy dashboard state as Custom Resources
          </p>
        </div>
        <button
          onClick={() => setLocalConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            localConfig.enabled ? 'bg-purple-500' : 'bg-secondary'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              localConfig.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Configuration */}
      {localConfig.enabled && (
        <div className="space-y-4">
          {/* Primary Cluster */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Primary Cluster
            </label>
            <div className="flex gap-2">
              <select
                value={localConfig.primaryCluster}
                onChange={e => setLocalConfig(prev => ({ ...prev, primaryCluster: e.target.value }))}
                className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
              >
                <option value="">Select a cluster...</option>
                {clusters.map((cluster: ClusterInfo) => (
                  <option key={cluster.name} value={cluster.name}>
                    {cluster.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => localConfig.primaryCluster && handleTest(localConfig.primaryCluster)}
                disabled={!localConfig.primaryCluster || testing}
                className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
              </button>
            </div>
            {testResult && testResult.cluster === localConfig.primaryCluster && (
              <p className={`text-xs mt-1 ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                {testResult.success ? 'Connection successful' : 'Connection failed'}
              </p>
            )}
          </div>

          {/* Sync Mode */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Sync Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setLocalConfig(prev => ({ ...prev, syncMode: 'primary-only' }))}
                className={`flex-1 px-3 py-2 rounded-lg border ${
                  localConfig.syncMode === 'primary-only'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground'
                }`}
              >
                Primary Only
              </button>
              <button
                onClick={() => setLocalConfig(prev => ({ ...prev, syncMode: 'active-passive' }))}
                className={`flex-1 px-3 py-2 rounded-lg border ${
                  localConfig.syncMode === 'active-passive'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground'
                }`}
              >
                Active-Passive
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {localConfig.syncMode === 'active-passive'
                ? 'Failover to secondary cluster if primary is unavailable'
                : 'Only sync to primary cluster'}
            </p>
          </div>

          {/* Secondary Cluster (if active-passive) */}
          {localConfig.syncMode === 'active-passive' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Secondary Cluster (Failover)
              </label>
              <div className="flex gap-2">
                <select
                  value={localConfig.secondaryCluster || ''}
                  onChange={e => setLocalConfig(prev => ({ ...prev, secondaryCluster: e.target.value }))}
                  className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
                >
                  <option value="">Select a cluster...</option>
                  {clusters
                    .filter((c: ClusterInfo) => c.name !== localConfig.primaryCluster)
                    .map((cluster: ClusterInfo) => (
                      <option key={cluster.name} value={cluster.name}>
                        {cluster.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => localConfig.secondaryCluster && handleTest(localConfig.secondaryCluster)}
                  disabled={!localConfig.secondaryCluster || testing}
                  className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-50"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                </button>
              </div>
              {testResult && testResult.cluster === localConfig.secondaryCluster && (
                <p className={`text-xs mt-1 ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                  {testResult.success ? 'Connection successful' : 'Connection failed'}
                </p>
              )}
            </div>
          )}

          {/* Namespace */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Namespace
            </label>
            <input
              type="text"
              value={localConfig.namespace}
              onChange={e => setLocalConfig(prev => ({ ...prev, namespace: e.target.value }))}
              placeholder="kubestellar-console"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Namespace where console CRs will be stored
            </p>
          </div>

          {/* Status */}
          {isEnabled && (
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="text-sm font-medium text-foreground mb-2">Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Primary Cluster</span>
                  <div className="flex items-center gap-2">
                    {getHealthIcon(status.primaryHealth)}
                    <span className="text-foreground">{config.primaryCluster || 'Not set'}</span>
                  </div>
                </div>
                {config.secondaryCluster && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Secondary Cluster</span>
                    <div className="flex items-center gap-2">
                      {getHealthIcon(status.secondaryHealth || 'unknown')}
                      <span className="text-foreground">{config.secondaryCluster}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Active Cluster</span>
                  <span className="text-foreground">
                    {status.activeCluster || 'None'}
                    {status.failoverActive && (
                      <span className="ml-2 text-xs text-yellow-500">(Failover)</span>
                    )}
                  </span>
                </div>
                {status.message && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Message</span>
                    <span className="text-foreground">{status.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Save Button */}
          {hasChanges && (
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
              >
                <Check className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info about kubectl */}
      <div className="mt-4 p-4 rounded-lg bg-secondary/30">
        <p className="text-sm text-muted-foreground">
          When enabled, you can use <code className="px-1 py-0.5 rounded bg-secondary text-foreground">kubectl</code> to
          manage workloads, groups, and deployments. Changes made via kubectl will automatically sync to the UI.
        </p>
        <div className="mt-2 text-xs text-muted-foreground font-mono">
          kubectl get managedworkloads,clustergroups,workloaddeployments -n {localConfig.namespace}
        </div>
      </div>
    </div>
  )
}
