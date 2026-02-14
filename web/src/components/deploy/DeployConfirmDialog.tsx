import { useEffect, useState } from 'react'
import {
  Rocket,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  KeyRound,
  User,
  Network,
  Globe,
  HardDrive,
  Shield,
  Gauge,
  ShieldCheck,
  Server,
  Blocks,
  ShieldAlert,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals/BaseModal'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useResolveDependencies, type ResolvedDependency } from '../../hooks/useDependencies'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'

interface DeployConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  workloadName: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName?: string
}

// Category grouping for dependency kinds
const DEP_CATEGORIES: { label: string; kinds: string[]; icon: typeof Shield }[] = [
  { label: 'RBAC & Identity', kinds: ['ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding'], icon: Shield },
  { label: 'Configuration', kinds: ['ConfigMap', 'Secret'], icon: FileText },
  { label: 'Networking', kinds: ['Service', 'Ingress', 'NetworkPolicy'], icon: Network },
  { label: 'Scaling & Availability', kinds: ['HorizontalPodAutoscaler', 'PodDisruptionBudget'], icon: Gauge },
  { label: 'Storage', kinds: ['PersistentVolumeClaim'], icon: HardDrive },
  { label: 'Custom Resources', kinds: ['CustomResourceDefinition'], icon: Blocks },
  { label: 'Admission Control', kinds: ['ValidatingWebhookConfiguration', 'MutatingWebhookConfiguration'], icon: ShieldAlert },
]

// Icon per dependency kind
const KIND_ICONS: Record<string, typeof Shield> = {
  ServiceAccount: User,
  Role: Shield,
  RoleBinding: ShieldCheck,
  ClusterRole: Shield,
  ClusterRoleBinding: ShieldCheck,
  ConfigMap: FileText,
  Secret: KeyRound,
  Service: Server,
  Ingress: Globe,
  NetworkPolicy: Network,
  HorizontalPodAutoscaler: Gauge,
  PodDisruptionBudget: Shield,
  PersistentVolumeClaim: HardDrive,
  CustomResourceDefinition: Blocks,
  ValidatingWebhookConfiguration: ShieldAlert,
  MutatingWebhookConfiguration: ShieldAlert,
}

function groupDependencies(deps: ResolvedDependency[]) {
  const groups: { label: string; icon: typeof Shield; deps: ResolvedDependency[] }[] = []

  for (const cat of DEP_CATEGORIES) {
    const matching = deps.filter(d => cat.kinds.includes(d.kind))
    if (matching.length > 0) {
      groups.push({ label: cat.label, icon: cat.icon, deps: matching })
    }
  }

  // Catch-all for any kinds not in categories
  const knownKinds = new Set(DEP_CATEGORIES.flatMap(c => c.kinds))
  const uncategorized = deps.filter(d => !knownKinds.has(d.kind))
  if (uncategorized.length > 0) {
    groups.push({ label: 'Other', icon: FileText, deps: uncategorized })
  }

  return groups
}

export function DeployConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  workloadName,
  namespace,
  sourceCluster,
  targetClusters,
  groupName,
}: DeployConfirmDialogProps) {
  const { t } = useTranslation()
  const { data, isLoading, error, resolve, reset } = useResolveDependencies()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Resolve dependencies when dialog opens
  useEffect(() => {
    if (isOpen && sourceCluster && namespace && workloadName) {
      resolve(sourceCluster, namespace, workloadName)
      setExpandedGroups(new Set())
    }
    if (!isOpen) {
      reset()
    }
  }, [isOpen, sourceCluster, namespace, workloadName, resolve, reset])

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const groups = data ? groupDependencies(data.dependencies) : []
  const totalDeps = data?.dependencies.length ?? 0
  const hasWarnings = data?.warnings && data.warnings.length > 0

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      {/* Header */}
      <BaseModal.Header
        title={t('deploy.confirmDeployment')}
        icon={Rocket}
        onClose={onClose}
      />

      {/* Content */}
      <BaseModal.Content>
        <div className="space-y-4">
          {/* Workload info */}
          <div className="rounded-lg bg-card/50 border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('deploy.workload')}</span>
              <span className="text-sm font-medium text-foreground">
                {workloadName}
                {data?.kind && (
                  <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    {data.kind}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('common.namespace')}</span>
              <span className="text-sm font-mono text-foreground">{namespace}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('common.source')}</span>
              <ClusterBadge cluster={sourceCluster} size="sm" />
            </div>
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground mt-0.5">{t('common.target')}</span>
              <div className="flex flex-wrap justify-end gap-1">
                {targetClusters.map(c => (
                  <ClusterBadge key={c} cluster={c} size="sm" />
                ))}
              </div>
            </div>
            {groupName && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('deploy.group')}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{groupName}</span>
              </div>
            )}
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-muted-foreground">{t('deploy.resolvingDependencies')}</span>
            </div>
          )}

          {/* Error state — still allow deploy */}
          {error && !isLoading && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-yellow-400 font-medium">{t('deploy.couldNotResolve')}</p>
                <p className="text-xs text-yellow-400/70 mt-0.5">{error.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('deploy.canStillDeploy')}</p>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {data && !isLoading && (
            <div>
              <div className="text-sm text-muted-foreground mb-2">
                {totalDeps > 0
                  ? t('deploy.willDeployDeps', { count: totalDeps })
                  : t('deploy.noDependencies')}
              </div>

              {groups.map(group => {
                const GroupIcon = group.icon
                const isExpanded = expandedGroups.has(group.label)

                return (
                  <div key={group.label} className="border-b border-border/50 last:border-0">
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-card/30 rounded transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                      <GroupIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="text-sm text-foreground flex-1">{group.label}</span>
                      <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                        {group.deps.length}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="ml-8 mb-2 space-y-0.5">
                        {group.deps.map(dep => {
                          const DepIcon = KIND_ICONS[dep.kind] ?? FileText
                          return (
                            <div
                              key={`${dep.kind}-${dep.name}`}
                              className="flex items-center gap-2 py-0.5 text-xs"
                            >
                              <DepIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground w-24 truncate shrink-0">{dep.kind}</span>
                              <span className="text-foreground truncate flex-1">{dep.name}</span>
                              {dep.optional && (
                                <span className="text-[10px] text-yellow-500 shrink-0">{t('deploy.optional')}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="space-y-1">
              {data!.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                  <span className="text-yellow-400/80">{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </BaseModal.Content>

      {/* Footer */}
      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2',
              'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400',
            )}
          >
            <Rocket className="w-4 h-4" />
            {t('deploy.deployToCluster', { count: targetClusters.length })}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
