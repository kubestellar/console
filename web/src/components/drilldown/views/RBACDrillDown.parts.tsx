/* eslint-disable react-refresh/only-export-components */
import {
  Loader2, Copy, Check, AlertTriangle,
  Shield, ShieldCheck, Server, User, RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { MAX_BINDINGS_TO_DESCRIBE, type RoleBinding } from './useRBACDrillDown'

// ---------------------------------------------------------------------------
// RBACDrillDownHeader
// ---------------------------------------------------------------------------

interface HeaderProps {
  subjectType: string
  subject: string
  namespace?: string
  cluster: string
  agentConnected: boolean
  refreshing: boolean
  onDrillToNamespace: (cluster: string, ns: string) => void
  onDrillToCluster: (cluster: string) => void
  onRefresh: () => void
}

export function RBACDrillDownHeader({
  subjectType, subject, namespace, cluster,
  agentConnected, refreshing,
  onDrillToNamespace, onDrillToCluster, onRefresh,
}: HeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <User className="w-4 h-4 text-purple-400" />
          <span className="text-muted-foreground">{subjectType}</span>
          <span className="font-mono text-purple-400">{subject}</span>
        </div>
        {namespace && (
          <button
            onClick={() => onDrillToNamespace(cluster, namespace)}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300">{namespace}</span>
          </button>
        )}
        <button
          onClick={() => onDrillToCluster(cluster)}
          className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
          <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
        </button>
        {/* Refresh button — re-fetches bindings and clears stale Describe/YAML output. */}
        <button
          onClick={onRefresh}
          disabled={!agentConnected || refreshing}
          className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="rbac-drilldown-refresh"
          aria-label={t('common.refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          <span>{t('common.refresh')}</span>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RBACOverviewTab
// ---------------------------------------------------------------------------

interface OverviewTabProps {
  loadError: string | null
  loading: boolean
  totalBindings: number
  subjectType: string
  subject: string
  clusterBindings: RoleBinding[]
  roleBindings: RoleBinding[]
}

export function RBACOverviewTab({
  loadError, loading, totalBindings, subjectType, subject,
  clusterBindings, roleBindings,
}: OverviewTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      {loadError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{loadError}</span>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{t('drilldown.rbac.loadingBindings')}</span>
        </div>
      ) : totalBindings === 0 ? (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-yellow-400">{t('drilldown.rbac.noBindingsForSubject', { type: subjectType, subject })}</p>
        </div>
      ) : (
        <>
          {clusterBindings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                {t('drilldown.rbac.clusterRoleBindingsHeader', { count: clusterBindings.length })}
              </h3>
              <div className="space-y-2">
                {clusterBindings.map((b) => (
                  <div key={b.name} className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-sm text-green-400">{b.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {b.roleKind}: <span className="text-foreground">{b.roleName}</span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                      {t('drilldown.rbac.clusterWide')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {roleBindings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                {t('drilldown.rbac.roleBindingsHeader', { count: roleBindings.length })}
              </h3>
              <div className="space-y-2">
                {roleBindings.map((b) => (
                  <div key={`${b.namespace}-${b.name}`} className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-sm text-blue-400">{b.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {b.roleKind}: <span className="text-foreground">{b.roleName}</span>
                        {b.namespace && (
                          <> {t('drilldown.rbac.inNamespace')} <span className="text-foreground">{b.namespace}</span></>
                        )}
                      </div>
                    </div>
                    {b.namespace && (
                      <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {b.namespace}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RBACOutputPane — shared by Describe and YAML tabs
// ---------------------------------------------------------------------------

interface OutputPaneProps {
  loading: boolean
  output: string | null
  copiedField: string | null
  copiedFieldKey: string
  hiddenBindingCount: number
  totalBindings: number
  loadingText: string
  onCopy: (field: string, value: string) => void
}

export function RBACOutputPane({
  loading, output, copiedField, copiedFieldKey,
  hiddenBindingCount, totalBindings, loadingText, onCopy,
}: OutputPaneProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">{loadingText}</span>
      </div>
    )
  }

  if (output) {
    return (
      <div className="relative">
        <button
          onClick={() => onCopy(copiedFieldKey, output)}
          className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {copiedField === copiedFieldKey
            ? <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</>
            : <><Copy className="w-3 h-3" /> {t('common.copy')}</>}
        </button>
        {/* Truncation notice (Issue 9267) */}
        {hiddenBindingCount > 0 && (
          <div
            className="mb-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400"
            data-testid="rbac-drilldown-truncation-notice"
          >
            {t('drilldown.rbac.truncationNotice', {
              shown: MAX_BINDINGS_TO_DESCRIBE,
              total: totalBindings,
              hidden: hiddenBindingCount,
            })}
          </div>
        )}
        <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
          {output}
        </pre>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
      <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
    </div>
  )
}
