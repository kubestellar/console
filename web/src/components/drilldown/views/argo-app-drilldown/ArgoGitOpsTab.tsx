import { BookOpen, Check, CheckCircle, Copy, ExternalLink, GitBranch, Loader2, Play, RefreshCw, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'
import { buildRestartSnippet } from './helpers'
import type { ArgoGitOpsTabProps } from './types'

export function ArgoGitOpsTab({
  appName,
  namespace,
  syncStatus,
  isSyncing,
  syncResult,
  copiedField,
  restartTimestamp,
  onTriggerSync,
  onCopy,
}: ArgoGitOpsTabProps) {
  const { t } = useTranslation()
  const restartSnippet = buildRestartSnippet(appName, namespace, restartTimestamp, t('drilldown.argoApp.defaultDeploymentName'))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-orange-400" />
          {t('drilldown.argoApp.gitopsRestartTitle')}
        </h4>
        <a
          href="https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-purple-400 hover:underline"
        >
          <BookOpen className="w-3 h-3" />
          {t('drilldown.argoApp.argocdDocs')}
        </a>
      </div>

      <div className="p-4 rounded-lg border border-border bg-card/50 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="text-sm font-medium text-foreground">{t('drilldown.argoApp.triggerSyncTitle')}</h5>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('drilldown.argoApp.triggerSyncDesc')}
              {syncStatus === 'OutOfSync' && (
                <span className="ml-1 text-yellow-400 font-medium">{t('drilldown.argoApp.outOfSyncWarning')}</span>
              )}
            </p>
          </div>
          <button
            onClick={() => onTriggerSync(appName, namespace)}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isSyncing ? t('drilldown.argoApp.syncing') : t('drilldown.argoApp.syncNow')}
          </button>
        </div>
        {syncResult && (
          <div className={cn(
            'flex items-start gap-2 p-2 rounded text-xs',
            syncResult.success
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400',
          )}>
            {syncResult.success
              ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            }
            <span>
              {syncResult.success
                ? t('drilldown.argoApp.syncSuccessMessage', { appName, namespace })
                : t('drilldown.argoApp.syncFailedMessage', { error: syncResult.error ?? '' })
              }
            </span>
          </div>
        )}
      </div>

      <div className="p-4 rounded-lg border border-border bg-card/50 space-y-3">
        <h5 className="text-sm font-medium text-foreground flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-orange-400" />
          {t('drilldown.argoApp.declarativeRestartTitle')}
        </h5>
        <p className="text-xs text-muted-foreground">
          {t('drilldown.argoApp.declarativeRestartDesc')}
          <code className="px-1 py-0.5 rounded bg-secondary text-xs font-mono">
            kubectl.kubernetes.io/restartedAt
          </code>
          {t('drilldown.argoApp.declarativeRestartDescSuffix')}
        </p>
        <div className="relative group">
          <pre className="p-3 rounded-lg bg-secondary/50 border border-border text-xs font-mono text-foreground overflow-x-auto">
{`${t('drilldown.argoApp.restartSnippetComment')}
${restartSnippet}`}
          </pre>
          <button
            onClick={() => onCopy('restart-snippet', restartSnippet)}
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground bg-secondary/80 hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100"
          >
            {copiedField === 'restart-snippet' ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            {t('drilldown.argoApp.copyButton')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('drilldown.argoApp.afterCommitHint')}
          <strong className="text-orange-400">{t('drilldown.argoApp.syncNow')}</strong>
          {t('drilldown.argoApp.afterCommitHintSuffix')}
        </p>
      </div>

      <div className="p-4 rounded-lg border border-orange-500/20 bg-orange-500/5 space-y-3">
        <h5 className="text-sm font-medium text-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-orange-400" />
          {t('drilldown.argoApp.whyDeclarativeTitle')}
        </h5>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" /><span>{t('drilldown.argoApp.benefit1')}</span></li>
          <li className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" /><span>{t('drilldown.argoApp.benefit2')}</span></li>
          <li className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" /><span>{t('drilldown.argoApp.benefit3')}</span></li>
          <li className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" /><span>{t('drilldown.argoApp.benefit4')}</span></li>
        </ul>
        <div className="flex gap-3 pt-1">
          <a
            href="https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            {t('drilldown.argoApp.argocdDeclarativeSetup')}
          </a>
          <a
            href="https://www.digitalocean.com/community/tutorials/how-to-deploy-to-kubernetes-using-argo-cd-and-gitops"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            {t('drilldown.argoApp.gitopsBestPractices')}
          </a>
        </div>
      </div>
    </div>
  )
}
