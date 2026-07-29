import { Check, AlertTriangle, Play, Loader2, ChevronRight, Box, Server, Shield, Settings, Database, Network, Layers, Container, FileText, Puzzle, X } from 'lucide-react'
import type { RefObject } from 'react'
import { TechnicalAcronym } from '../shared/TechnicalAcronym'
import { cn } from '../../lib/cn'

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

function getResourceIcon(kind: string) {
  const resourceKind = kind?.toLowerCase() || ''
  if (resourceKind.includes('deployment')) return <Box className="w-4 h-4 text-blue-400" />
  if (resourceKind.includes('service')) return <Network className="w-4 h-4 text-green-400" />
  if (resourceKind.includes('pod')) return <Container className="w-4 h-4 text-cyan-400" />
  if (resourceKind.includes('configmap')) return <Settings className="w-4 h-4 text-purple-400" />
  if (resourceKind.includes('secret')) return <Shield className="w-4 h-4 text-red-400" />
  if (resourceKind.includes('serviceaccount')) return <Server className="w-4 h-4 text-orange-400" />
  if (resourceKind.includes('role') || resourceKind.includes('clusterrole')) return <Shield className="w-4 h-4 text-yellow-400" />
  if (resourceKind.includes('customresourcedefinition') || resourceKind.includes('crd')) return <Puzzle className="w-4 h-4 text-purple-400" />
  if (resourceKind.includes('namespace')) return <Layers className="w-4 h-4 text-blue-400" />
  if (resourceKind.includes('persistentvolume') || resourceKind.includes('pvc')) return <Database className="w-4 h-4 text-cyan-400" />
  if (resourceKind.includes('ingress')) return <Network className="w-4 h-4 text-green-400" />
  if (resourceKind.includes('statefulset') || resourceKind.includes('daemonset') || resourceKind.includes('replicaset')) return <Layers className="w-4 h-4 text-blue-400" />
  if (resourceKind.includes('job') || resourceKind.includes('cronjob')) return <Settings className="w-4 h-4 text-yellow-400" />
  if (resourceKind.includes('webhook')) return <Network className="w-4 h-4 text-purple-400" />
  return <FileText className="w-4 h-4 text-yellow-500" />
}

function formatResourceKind(kind: string): string {
  if (!kind) return 'Resource'
  if (kind.toLowerCase() === 'customresourcedefinition') return 'CRD'
  if (kind.toLowerCase() === 'serviceaccount') return 'ServiceAccount'
  if (kind.toLowerCase() === 'clusterrole') return 'ClusterRole'
  if (kind.toLowerCase() === 'clusterrolebinding') return 'ClusterRoleBinding'
  return kind
}

function FormattedResourceKind({ kind }: { kind: string }) {
  const formatted = formatResourceKind(kind)
  if (formatted === 'CRD') {
    return <TechnicalAcronym term="CRD">CRD</TechnicalAcronym>
  }
  return <>{formatted}</>
}

interface SyncPhaseIndicatorProps {
  phase: SyncPhase
  phaseProgress: Record<SyncPhase, number>
}

export function SyncPhaseIndicator({ phase, phaseProgress }: SyncPhaseIndicatorProps) {
  return (
    <div className="px-6 py-3 bg-muted/30 border-b border-border">
      <div className="flex items-center justify-between text-sm">
        {['Detection', 'Plan', 'Execute', 'Complete'].map((label, index) => {
          const stepNumber = index + 1
          const isActive = phaseProgress[phase] === stepNumber
          const isComplete = phaseProgress[phase] > stepNumber

          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                  isComplete
                    ? 'bg-green-500 text-foreground'
                    : isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isComplete ? <Check className="w-3 h-3" /> : stepNumber}
              </div>
              <span className={isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                {label}
              </span>
              {index < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-2" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface SyncResourcePreviewProps {
  driftedResources: DriftedResource[]
  syncPlan: SyncPlan[]
}

export function SyncResourcePreview({ driftedResources, syncPlan }: SyncResourcePreviewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          Drift Detected ({driftedResources.length} resources)
        </h3>
        <div className="space-y-2 max-h-[250px] overflow-y-auto">
          {(driftedResources || []).map((resource, index) => (
            <div key={index} className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-sm">
                {getResourceIcon(resource.kind)}
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-card text-muted-foreground">
                  <FormattedResourceKind kind={resource.kind} />
                </span>
                <span className="font-medium text-foreground truncate">{resource.name}</span>
              </div>
              {(resource.field || resource.clusterValue || resource.gitValue) && (
                <div className="mt-2 text-xs font-mono pl-6">
                  {resource.field && <span className="text-muted-foreground">{resource.field}: </span>}
                  {resource.clusterValue && <span className="text-red-400 line-through">{resource.clusterValue}</span>}
                  {resource.clusterValue && resource.gitValue && <span className="text-muted-foreground"> → </span>}
                  {resource.gitValue && <span className="text-green-400">{resource.gitValue}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Sync Plan ({syncPlan.length} changes)</h3>
        <div className="space-y-1 max-h-[120px] overflow-y-auto">
          {(syncPlan || []).map((item, index) => {
            const [kind, name] = item.resource.includes('/') ? item.resource.split('/') : ['Resource', item.resource]
            return (
              <div key={index} className="flex items-center gap-2 text-sm py-1">
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-xs font-medium',
                  item.action === 'create'
                    ? 'bg-green-500/20 text-green-400'
                    : item.action === 'delete'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-blue-500/20 text-blue-400',
                )}>
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

interface SyncConsoleOutputProps {
  tokenCount: number
  syncLogs: SyncLogEntry[]
  logContainerRef: RefObject<HTMLDivElement | null>
}

export function SyncConsoleOutput({ tokenCount, syncLogs, logContainerRef }: SyncConsoleOutputProps) {
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
        {(syncLogs || []).map((log, index) => (
          <div key={index} className="flex items-start gap-2 py-0.5">
            <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
            {log.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-blue-400 mt-0.5" />}
            {log.status === 'success' && <Check className="w-3 h-3 text-green-400 mt-0.5" />}
            {log.status === 'error' && <X className="w-3 h-3 text-red-400 mt-0.5" />}
            <span className={
              log.status === 'success'
                ? 'text-green-400'
                : log.status === 'error'
                  ? 'text-red-400'
                  : 'text-foreground'
            }>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface SyncConfirmationFooterProps {
  phase: SyncPhase
  repoUrl: string
  path: string
  onClose: () => void
  onRunSync: () => void
}

export function SyncConfirmationFooter({ phase, repoUrl, path, onClose, onRunSync }: SyncConfirmationFooterProps) {
  return (
    <>
      <div className="text-xs text-muted-foreground">
        {repoUrl.replace('https://github.com/', '')}:{path}
      </div>
      <div className="flex-1" />
      <div className="flex gap-2">
        {phase === 'plan' && (
          <>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onRunSync}
              className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Apply Sync
            </button>
          </>
        )}
        {phase === 'complete' && (
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-green-500 text-foreground hover:bg-green-600 transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Done
          </button>
        )}
      </div>
    </>
  )
}
