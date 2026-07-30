/* eslint-disable react-refresh/only-export-components */
import { Check, AlertTriangle, Loader2, ChevronRight, Box, Server, Shield, Settings, Database, Network, Layers, Container, FileText, Puzzle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TechnicalAcronym } from '../shared/TechnicalAcronym'

export type SyncPhase = 'detection' | 'plan' | 'execution' | 'complete'

export interface DriftedResource {
  kind: string
  name: string
  namespace: string
  field: string
  gitValue: string
  clusterValue: string
}

export interface SyncPlan {
  action: 'create' | 'update' | 'delete'
  resource: string
  details: string
}

export interface SyncLogEntry {
  timestamp: string
  message: string
  status: 'pending' | 'running' | 'success' | 'error'
}

export function getResourceIcon(kind: string) {
  const k = kind?.toLowerCase() || ''
  if (k.includes('deployment')) return <Box className="w-4 h-4 text-blue-400" />
  if (k.includes('service')) return <Network className="w-4 h-4 text-green-400" />
  if (k.includes('pod')) return <Container className="w-4 h-4 text-cyan-400" />
  if (k.includes('configmap')) return <Settings className="w-4 h-4 text-purple-400" />
  if (k.includes('secret')) return <Shield className="w-4 h-4 text-red-400" />
  if (k.includes('serviceaccount')) return <Server className="w-4 h-4 text-orange-400" />
  if (k.includes('role') || k.includes('clusterrole')) return <Shield className="w-4 h-4 text-yellow-400" />
  if (k.includes('customresourcedefinition') || k.includes('crd')) return <Puzzle className="w-4 h-4 text-purple-400" />
  if (k.includes('namespace')) return <Layers className="w-4 h-4 text-blue-400" />
  if (k.includes('persistentvolume') || k.includes('pvc')) return <Database className="w-4 h-4 text-cyan-400" />
  if (k.includes('ingress')) return <Network className="w-4 h-4 text-green-400" />
  if (k.includes('statefulset') || k.includes('daemonset') || k.includes('replicaset')) return <Layers className="w-4 h-4 text-blue-400" />
  if (k.includes('job') || k.includes('cronjob')) return <Settings className="w-4 h-4 text-yellow-400" />
  if (k.includes('webhook')) return <Network className="w-4 h-4 text-purple-400" />
  return <FileText className="w-4 h-4 text-yellow-500" />
}

export function formatResourceKind(kind: string): string {
  if (!kind) return 'Resource'
  if (kind.toLowerCase() === 'customresourcedefinition') return 'CRD'
  if (kind.toLowerCase() === 'serviceaccount') return 'ServiceAccount'
  if (kind.toLowerCase() === 'clusterrole') return 'ClusterRole'
  if (kind.toLowerCase() === 'clusterrolebinding') return 'ClusterRoleBinding'
  return kind
}

export function FormattedResourceKind({ kind }: { kind: string }) {
  const formatted = formatResourceKind(kind)
  if (formatted === 'CRD') {
    return <TechnicalAcronym term="CRD">CRD</TechnicalAcronym>
  }
  return <>{formatted}</>
}

export const PHASE_PROGRESS: Record<SyncPhase, number> = {
  detection: 1,
  plan: 2,
  execution: 3,
  complete: 4,
}

interface SyncPhaseIndicatorProps {
  phase: SyncPhase
}

export function SyncPhaseIndicator({ phase }: SyncPhaseIndicatorProps) {
  return (
    <div className="px-6 py-3 bg-muted/30 border-b border-border">
      <div className="flex items-center justify-between text-sm">
        {(['Detection', 'Plan', 'Execute', 'Complete'] as const).map((label, i) => {
          const stepNum = i + 1
          const isActive = PHASE_PROGRESS[phase] === stepNum
          const isComplete = PHASE_PROGRESS[phase] > stepNum

          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                ${isComplete ? 'bg-green-500 text-foreground' :
                  isActive ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'}`}
              >
                {isComplete ? <Check className="w-3 h-3" /> : stepNum}
              </div>
              <span className={isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                {label}
              </span>
              {i < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-2" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface DetectionPhaseContentProps {
  isInitializing: boolean
  syncLogsLength: number
}

export function DetectionPhaseContent({ isInitializing, syncLogsLength }: DetectionPhaseContentProps) {
  const { t } = useTranslation()
  if (isInitializing && syncLogsLength === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm text-muted-foreground">Initializing drift detection...</p>
      </div>
    )
  }
  if (syncLogsLength > 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('gitops.detectingDrift')}</span>
        </div>
      </div>
    )
  }
  return null
}

interface PlanPhaseContentProps {
  driftedResources: DriftedResource[]
  syncPlan: SyncPlan[]
}

export function PlanPhaseContent({ driftedResources, syncPlan }: PlanPhaseContentProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          Drift Detected ({driftedResources.length} resources)
        </h3>
        <div className="space-y-2 max-h-[250px] overflow-y-auto">
          {driftedResources.map((r, i) => (
            <div key={i} className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-sm">
                {getResourceIcon(r.kind)}
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-card text-muted-foreground">
                  <FormattedResourceKind kind={r.kind} />
                </span>
                <span className="font-medium text-foreground truncate">{r.name}</span>
              </div>
              {(r.field || r.clusterValue || r.gitValue) && (
                <div className="mt-2 text-xs font-mono pl-6">
                  {r.field && <span className="text-muted-foreground">{r.field}: </span>}
                  {r.clusterValue && <span className="text-red-400 line-through">{r.clusterValue}</span>}
                  {r.clusterValue && r.gitValue && <span className="text-muted-foreground"> → </span>}
                  {r.gitValue && <span className="text-green-400">{r.gitValue}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Sync Plan ({syncPlan.length} changes)</h3>
        <div className="space-y-1 max-h-[120px] overflow-y-auto">
          {syncPlan.map((item, i) => {
            const [kind, name] = item.resource.includes('/') ? item.resource.split('/') : ['Resource', item.resource]
            return (
              <div key={i} className="flex items-center gap-2 text-sm py-1">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  item.action === 'create' ? 'bg-green-500/20 text-green-400' :
                  item.action === 'delete' ? 'bg-red-500/20 text-red-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {item.action.toUpperCase()}
                </span>
                {getResourceIcon(kind)}
                <span className="text-muted-foreground text-xs"><FormattedResourceKind kind={kind} /></span>
                <span className="text-foreground truncate">{name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface ExecutionPhaseContentProps {
  syncLogs: SyncLogEntry[]
  tokenCount: number
  logContainerRef: React.RefObject<HTMLDivElement | null>
}

export function ExecutionPhaseContent({ syncLogs, tokenCount, logContainerRef }: ExecutionPhaseContentProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Console Output</span>
        <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
          Tokens: {tokenCount.toLocaleString()}
        </span>
      </div>
      <div
        ref={logContainerRef}
        className="h-48 p-3 rounded-lg bg-black/50 border border-border font-mono text-xs overflow-y-auto"
      >
        {syncLogs.map((log, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
            {log.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-blue-400 mt-0.5" />}
            {log.status === 'success' && <Check className="w-3 h-3 text-green-400 mt-0.5" />}
            {log.status === 'error' && <X className="w-3 h-3 text-red-400 mt-0.5" />}
            <span className={
              log.status === 'success' ? 'text-green-400' :
              log.status === 'error' ? 'text-red-400' :
              'text-foreground'
            }>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
