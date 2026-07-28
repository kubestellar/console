import { Monitor, Check, AlertCircle, Bot, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface KubeVirtSectionProps {
  healthyClusters: any[]
  kubevirtClusters: any[]
  hasKubevirtAnywhere: boolean
  KUBEVIRT_NAMESPACE: string
  KUBEVIRT_MISSION_ROUTE: string
  onInstallKubeVirtOnCluster: (clusterContext: string) => void
  navigate?: (to: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
  Check?: typeof Check
  AlertCircle?: typeof AlertCircle
  Monitor?: typeof Monitor
  Bot?: typeof Bot
  ExternalLink?: typeof ExternalLink
}

export function KubeVirtSection({
  healthyClusters,
  kubevirtClusters,
  hasKubevirtAnywhere,
  KUBEVIRT_NAMESPACE,
  KUBEVIRT_MISSION_ROUTE,
  onInstallKubeVirtOnCluster,
  navigate,
  t,
  Check: CheckIcon = Check,
  AlertCircle: AlertCircleIcon = AlertCircle,
  Monitor: MonitorIcon = Monitor,
  ExternalLink: ExternalLinkIcon = ExternalLink,
}: KubeVirtSectionProps) {
  void Bot
  const internalNavigate = useNavigate()
  const navigateFn = navigate || internalNavigate

  return (
    <div className="mt-6">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-4">
              <MonitorIcon className="w-5 h-5 text-cyan-400" />
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
                        <MonitorIcon className="w-4 h-4 text-cyan-400" />
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
                          <MonitorIcon className="w-3.5 h-3.5" />
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
                  <CheckIcon className="w-4 h-4" />
                  <span className="font-medium">
                    {t('settings.localClusters.kubevirtDetectedCount', { count: kubevirtClusters.length })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-cyan-400 mb-2">
                  <AlertCircleIcon className="w-4 h-4" />
                  <span className="font-medium">{t('settings.localClusters.kubevirtNotDetected')}</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-3">
                {t('settings.localClusters.kubevirtInstallHint')}
              </p>
              <button
                onClick={() => navigateFn(KUBEVIRT_MISSION_ROUTE)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
              >
                <ExternalLinkIcon className="w-4 h-4" />
                {t('settings.localClusters.kubevirtOpenMission')}
              </button>
            </div>
    </div>
  )
}
