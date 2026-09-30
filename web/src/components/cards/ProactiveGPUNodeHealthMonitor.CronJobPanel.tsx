/**
 * CronJob install/uninstall/results management panel for a single cluster,
 * shown inside ProactiveGPUNodeHealthMonitor's expandable CronJob section.
 *
 * Extracted from ProactiveGPUNodeHealthMonitor.tsx to keep the main
 * component focused on data orchestration and rendering.
 */
import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, ChevronDown, Clock, Play, Trash2, Loader2, RefreshCw, Shield, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useGPUHealthCronJob } from '../../hooks/useCachedData'
import { StatusBadge, CheckRow } from './ProactiveGPUNodeHealthMonitor.StatusPanels'
import {
  DEFAULT_SCHEDULE,
  DEFAULT_NAMESPACE,
  DEFAULT_TIER,
  TIER_OPTIONS,
} from './ProactiveGPUNodeHealthMonitor.constants'

// CronJob management panel for a single cluster
export function CronJobClusterPanel({ cluster }: { cluster: string }) {
  const { t } = useTranslation(['common', 'cards'])
  const { status, isLoading, error, actionInProgress, install, uninstall, refetch } = useGPUHealthCronJob(cluster)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [showConfirmUninstall, setShowConfirmUninstall] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
  const [tier, setTier] = useState(DEFAULT_TIER)

  // Sync tier from status when loaded
  useEffect(() => {
    if (status?.tier && status.tier > 0) setTier(status.tier)
  }, [status?.tier])

  const handleInstall = async () => {
    await install({ namespace, schedule, tier })
    setShowInstallDialog(false)
  }

  const handleUpdateTier = async () => {
    if (!status) return
    await install({ namespace: status.namespace, schedule: status.schedule, tier })
  }

  const handleUninstall = async () => {
    await uninstall({ namespace: status?.namespace })
    setShowConfirmUninstall(false)
  }

  const tierChanged = status?.installed && status.tier > 0 && tier !== status.tier

  if (isLoading && !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/40">
        <Loader2 className="w-3 h-3 animate-spin" />
        {t('cards:gpuNodeHealth.checking', { cluster })}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-secondary overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <ClusterBadge cluster={cluster} size="sm" />
        <div className="flex-1 min-w-0">
          {status?.installed ? (
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <span className="text-xs text-green-300">{t('cards:gpuNodeHealth.installed')}</span>
              {status.schedule && (
                <span className="text-2xs text-white/40 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {status.schedule}
                </span>
              )}
              <span className="text-2xs text-white/30 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {t('cards:gpuNodeHealth.tier', { tier: status.tier || 1 })}
              </span>
              {status.version > 0 && (
                <span className="text-2xs text-white/20">v{status.version}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <span className="text-xs text-white/40">{t('cards:gpuNodeHealth.notInstalled')}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {status?.installed ? (
            <>
              {/* Status info */}
              {status.lastResult && (
                <span className={cn(
                  'text-2xs px-1.5 py-0.5 rounded',
                  status.lastResult === 'success' ? 'bg-green-500/10 text-green-400' :
                  status.lastResult === 'failed' ? 'bg-red-500/10 text-red-400' :
                  'bg-secondary text-white/40'
                )}>
                  {t('cards:gpuNodeHealth.last', { result: status.lastResult })}
                </span>
              )}
              {/* Results toggle */}
              {status.lastResults && status.lastResults.length > 0 && (
                <button
                  onClick={() => setShowResults(prev => !prev)}
                  className={cn(
                    'p-1 rounded transition-colors',
                    showResults ? 'bg-blue-500/15 text-blue-400' : 'text-white/30 hover:text-white/50'
                  )}
                  title={t('cards:gpuNodeHealth.viewResults')}
                >
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showResults && 'rotate-180')} />
                </button>
              )}
              {/* Uninstall button */}
              {!showConfirmUninstall ? (
                <button
                  onClick={() => setShowConfirmUninstall(true)}
                  disabled={!!actionInProgress}
                  className="p-1 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors disabled:opacity-50"
                  title={t('cards:gpuNodeHealth.uninstallCronJob')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleUninstall}
                    disabled={!!actionInProgress}
                    className="px-2 py-0.5 text-2xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {actionInProgress === 'uninstall' ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : t('cards:gpuNodeHealth.confirm')}
                  </button>
                  <button
                    onClick={() => setShowConfirmUninstall(false)}
                    className="px-2 py-0.5 text-2xs rounded bg-secondary text-white/40 hover:text-white/60 transition-colors"
                  >
                    {t('cards:gpuNodeHealth.cancel')}
                  </button>
                </div>
              )}
            </>
          ) : status?.canInstall ? (
            !showInstallDialog ? (
              <button
                onClick={() => setShowInstallDialog(true)}
                disabled={!!actionInProgress}
                className="flex items-center gap-1 px-2 py-1 text-2xs rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                {t('cards:gpuNodeHealth.install')}
              </button>
            ) : null
          ) : (
            <span className="text-2xs text-white/30 italic">{t('cards:gpuNodeHealth.noPermissions')}</span>
          )}
        </div>
      </div>

      {/* Install dialog */}
      {showInstallDialog && (
        <div className="border-t border-border px-3 py-2 bg-foreground/1 space-y-2">
          <div className="text-2xs text-white/50 uppercase tracking-wider">{t('cards:gpuNodeHealth.installCronJob')}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-2xs text-white/40 block mb-0.5">{t('cards:gpuNodeHealth.namespace')}</label>
              {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from ProactiveGPUNodeHealthMonitor.tsx (pre-existing baselined violation) */}
              <input
                type="text"
                value={namespace}
                onChange={e => setNamespace(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/80 focus:outline-hidden focus:border-white/20"
              />
            </div>
            <div>
              <label className="text-2xs text-white/40 block mb-0.5">{t('cards:gpuNodeHealth.scheduleCron')}</label>
              {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from ProactiveGPUNodeHealthMonitor.tsx (pre-existing baselined violation) */}
              <input
                type="text"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/80 focus:outline-hidden focus:border-white/20"
              />
            </div>
          </div>
          {/* Tier selector */}
          <div>
            <label className="text-2xs text-white/40 block mb-0.5">{t('cards:gpuNodeHealth.checkTier')}</label>
            {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from ProactiveGPUNodeHealthMonitor.tsx (pre-existing baselined violation) */}
            <select
              value={tier}
              onChange={e => setTier(Number(e.target.value))}
              className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/80 focus:outline-hidden focus:border-white/20"
            >
              {TIER_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-2xs text-white/30 mt-0.5">
              {TIER_OPTIONS.find(t => t.value === tier)?.description}
            </p>
            {tier === 4 && (
              <p className="text-2xs text-yellow-400/80 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t('cards:gpuNodeHealth.tier4Warning')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowInstallDialog(false)}
              className="px-2 py-1 text-2xs rounded bg-secondary text-white/40 hover:text-white/60 transition-colors"
            >
              {t('cards:gpuNodeHealth.cancel')}
            </button>
            <button
              onClick={handleInstall}
              disabled={!!actionInProgress}
              className="flex items-center gap-1 px-2 py-1 text-2xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'install' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {t('cards:gpuNodeHealth.install')}
            </button>
          </div>
        </div>
      )}

      {/* Tier selector + update (when installed) */}
      {status?.installed && status.canInstall && (
        <div className="border-t border-border px-3 py-1.5 flex items-center gap-2">
          <span className="text-2xs text-white/40">{t('cards:gpuNodeHealth.tierLabel')}</span>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from ProactiveGPUNodeHealthMonitor.tsx (pre-existing baselined violation) */}
          <select
            value={tier}
            onChange={e => setTier(Number(e.target.value))}
            className="px-1.5 py-0.5 text-2xs rounded border border-white/10 bg-secondary text-white/60 focus:outline-hidden focus:border-white/20"
          >
            {TIER_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {tierChanged && (
            <button
              onClick={handleUpdateTier}
              disabled={!!actionInProgress}
              className="flex items-center gap-1 px-2 py-0.5 text-2xs rounded bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'install' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {t('cards:gpuNodeHealth.update')}
            </button>
          )}
        </div>
      )}

      {/* Job stats (when installed) */}
      {status?.installed && (status.activeJobs > 0 || status.failedJobs > 0 || status.successJobs > 0) && (
        <div className="border-t border-border px-3 py-1.5 flex items-center gap-3 text-2xs">
          <span className="text-white/40">{t('cards:gpuNodeHealth.jobs')}</span>
          {status.activeJobs > 0 && <span className="text-blue-400">{t('cards:gpuNodeHealth.active', { count: status.activeJobs })}</span>}
          {status.successJobs > 0 && <span className="text-green-400">{t('cards:gpuNodeHealth.succeeded', { count: status.successJobs })}</span>}
          {status.failedJobs > 0 && <span className="text-red-400">{t('cards:gpuNodeHealth.jobsFailed', { count: status.failedJobs })}</span>}
          {status.lastRun && (
            <span className="text-white/30 ml-auto">Last: {new Date(status.lastRun).toLocaleTimeString()}</span>
          )}
        </div>
      )}

      {/* CronJob Results (expandable) */}
      {showResults && status?.lastResults && status.lastResults.length > 0 && (
        <div className="border-t border-border px-3 py-2 bg-foreground/1 space-y-1.5">
          <div className="text-2xs text-white/50 uppercase tracking-wider">{t('cards:gpuNodeHealth.latestResults')}</div>
          {status.lastResults.map(result => (
            <div key={result.nodeName} className="rounded border border-border bg-secondary p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-white/80">{result.nodeName}</span>
                <StatusBadge status={result.status} />
                {result.gpuCount != null && (
                  <span className="text-2xs text-white/30">{result.gpuCount} GPUs</span>
                )}
              </div>
              <div className="space-y-0.5">
                {(result.checks || []).map(check => (
                  <CheckRow key={check.name} check={check} />
                ))}
              </div>
              {result.issues && result.issues.length > 0 && (
                <div className="mt-1 pt-1 border-t border-white/4">
                  {result.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-1 text-2xs text-red-300/80">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-red-400/60" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border-t border-border px-3 py-1.5 text-xs text-red-400/80 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
          <button onClick={refetch} className="ml-auto text-2xs text-white/40 hover:text-white/60 underline">
            {t('cards:gpuNodeHealth.retry')}
          </button>
        </div>
      )}
    </div>
  )
}
