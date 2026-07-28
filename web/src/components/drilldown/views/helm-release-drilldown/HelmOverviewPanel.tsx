import { Clock, GitBranch, RefreshCw, Ship, Tag, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'
import type { HelmOverviewPanelProps } from './types'

export function HelmOverviewPanel({
  releaseName,
  chartName,
  chartVersion,
  appVersion,
  releaseInfo,
  releaseRevision,
  releaseHistory,
  parsedResources,
  onResourceClick,
  onShowMoreResources,
  helmActionLoading,
  onConfirmUninstall,
}: HelmOverviewPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <Ship className="w-8 h-8 text-blue-400 mt-1" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{releaseName}</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-4 h-4" />
                <span>Chart: {chartName || releaseInfo?.chart || t('common.loading')}</span>
              </div>
              {(chartVersion || releaseInfo?.app_version) && (
                <div className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  <span>App: {appVersion || releaseInfo?.app_version}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" />
                <span>Revision: {releaseInfo?.revision || releaseRevision || '1'}</span>
              </div>
            </div>
            {releaseInfo?.updated && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Updated: {new Date(releaseInfo.updated).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{releaseHistory?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">{t('drilldown.helm.revisions')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{parsedResources.filter(r => r.kind === 'Deployment').length}</div>
          <div className="text-xs text-muted-foreground">{t('common.deployments')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{parsedResources.filter(r => r.kind === 'Service').length}</div>
          <div className="text-xs text-muted-foreground">{t('common.services')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{parsedResources.length}</div>
          <div className="text-xs text-muted-foreground">{t('drilldown.helm.totalResources')}</div>
        </div>
      </div>

      {parsedResources.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.helm.deployedResources')}</h4>
          <div className="flex flex-wrap gap-2">
            {parsedResources.slice(0, 10).map((resource, i) => (
              <button
                key={`${resource.kind}-${resource.name}-${i}`}
                onClick={() => onResourceClick(resource)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  resource.kind === 'Deployment'
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'
                    : resource.kind === 'Service'
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
                    : 'bg-secondary border border-border text-muted-foreground',
                )}
              >
                <span>{resource.kind}:</span>
                <span className="font-mono">{resource.name}</span>
              </button>
            ))}
            {parsedResources.length > 10 && (
              <button
                onClick={onShowMoreResources}
                className="text-xs text-primary hover:underline"
              >
                +{parsedResources.length - 10} more
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
        <h4 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Uninstalling this release will remove all associated Kubernetes resources.
        </p>
        <button
          onClick={onConfirmUninstall}
          disabled={helmActionLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Uninstall Release
        </button>
      </div>
    </div>
  )
}
