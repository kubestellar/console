import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Monitor, Bot, Check, AlertCircle, ExternalLink } from 'lucide-react'

/** Namespace where KubeVirt is typically installed */
const KUBEVIRT_NAMESPACE = 'kubevirt'

/** Deep-link route for the KubeVirt install mission in console-kb */
const KUBEVIRT_MISSION_ROUTE = '/missions/install-kubevirt'

interface ClusterInfo {
  name: string
  context?: string
  namespaces?: string[]
}

interface KubeVirtSectionProps {
  healthyClusters: ClusterInfo[]
  onInstallKubeVirtOnCluster: (context: string) => void
}

export function KubeVirtSection({
  healthyClusters,
  onInstallKubeVirtOnCluster,
}: KubeVirtSectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // KubeVirt detection: check which connected clusters have the kubevirt namespace
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
                        <div className={`w-1.5 h-1.5 rounded-full ${hasKubevirt ? 'bg-green-500' : 'bg-gray-500'}`} />
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
          onClick={() => navigate(KUBEVIRT_MISSION_ROUTE)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {t('settings.localClusters.kubevirtOpenMission')}
        </button>
      </div>
    </div>
  )
}
