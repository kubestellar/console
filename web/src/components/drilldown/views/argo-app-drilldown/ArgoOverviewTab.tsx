import { AlertTriangle, CheckCircle, FolderGit, GitBranch, GitCommit, ExternalLink, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'
import { validateExternalUrl } from '../../../../lib/validateExternalUrl'
import { getHealthStatusStyle } from './helpers'
import type { ArgoOverviewTabProps } from './types'

export function ArgoOverviewTab({
  appName,
  project,
  targetRevision,
  repoURL,
  path,
  syncStatus,
  healthStatus,
  syncStyle,
  healthStyle,
  appResources,
  syncHistory,
  onResourceClick,
  onShowMoreResources,
}: ArgoOverviewTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-linear-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20">
        <div className="flex items-start gap-3">
          <GitBranch className="w-8 h-8 text-orange-400 mt-1" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{appName}</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {project && (
                <div className="flex items-center gap-1.5">
                  <FolderGit className="w-4 h-4" />
                  <span>Project: {project}</span>
                </div>
              )}
              {targetRevision && (
                <div className="flex items-center gap-1.5">
                  <GitCommit className="w-4 h-4" />
                  <span>Revision: {targetRevision}</span>
                </div>
              )}
            </div>
            {repoURL && validateExternalUrl(repoURL) && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <ExternalLink className="w-3 h-3" />
                <a
                  href={validateExternalUrl(repoURL)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground truncate max-w-md"
                >
                  {repoURL}
                </a>
                {path && <span className="text-muted-foreground">/{path}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', syncStyle.text)}>
            {syncStatus === 'Synced' ? <CheckCircle className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Sync Status</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', healthStyle.text)}>
            {healthStatus === 'Healthy' ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Health Status</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{appResources?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">{t('common.resources')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{syncHistory?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">{t('common.deployments')}</div>
        </div>
      </div>

      {appResources && appResources.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">Managed Resources</h4>
          <div className="flex flex-wrap gap-2">
            {appResources.slice(0, 8).map((resource, i) => {
              const resHealthStyle = getHealthStatusStyle(resource.health || 'Unknown')
              return (
                <button
                  key={`${resource.kind}-${resource.name}-${i}`}
                  onClick={() => onResourceClick(resource)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border',
                    resHealthStyle.bg,
                    resHealthStyle.text,
                    resHealthStyle.border,
                    'hover:opacity-80',
                  )}
                >
                  <span>{resource.kind}:</span>
                  <span className="font-mono">{resource.name}</span>
                </button>
              )
            })}
            {appResources.length > 8 && (
              <button
                onClick={onShowMoreResources}
                className="text-xs text-primary hover:underline"
              >
                +{appResources.length - 8} more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
