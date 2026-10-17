import { Loader2, AlertTriangle, Stethoscope, List, Database, Code } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import type { CRDInstance, CRDVersion } from './CRDDrillDown.types'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="text-sm">{message}</span>
    </div>
  )
}

function CenteredSpinner({ className = 'text-muted-foreground' }: { className?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className={cn('w-6 h-6 animate-spin', className)} />
    </div>
  )
}

interface VersionsTabProps {
  versions: CRDVersion[] | null
  isLoading: boolean
  error: string | null
}

export function CRDVersionsTab({ versions, isLoading, error }: VersionsTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">API Versions</h4>
      {error && <ErrorBanner message={error} />}
      {isLoading ? (
        <CenteredSpinner />
      ) : versions && versions.length > 0 ? (
        <div className="space-y-2">
          {versions.map((version, i) => (
            <div
              key={i}
              className={cn(
                'p-4 rounded-lg border bg-card/50',
                version.deprecated ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{version.name}</span>
                  {version.storage && (
                    <StatusBadge color="blue" size="xs">{t('common.storage')}</StatusBadge>
                  )}
                  {version.deprecated && (
                    <StatusBadge color="yellow" size="xs">{t('common.deprecated')}</StatusBadge>
                  )}
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded text-xs',
                  version.served ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                )}>
                  {version.served ? 'Served' : 'Not Served'}
                </span>
              </div>
              {version.deprecationWarning && (
                <p className="text-sm text-yellow-400">{version.deprecationWarning}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <List className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.noVersionInfo')}</p>
        </div>
      )}
    </div>
  )
}

interface InstancesTabProps {
  instances: CRDInstance[] | null
  isLoading: boolean
  error: string | null
  onInstanceClick: (namespace: string) => void
}

export function CRDInstancesTab({ instances, isLoading, error, onInstanceClick }: InstancesTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">Custom Resource Instances ({instances?.length || 0})</h4>
      {error && <ErrorBanner message={error} />}
      {isLoading ? (
        <CenteredSpinner />
      ) : instances && instances.length > 0 ? (
        <div className="space-y-2">
          {instances.map((instance, i) => (
            <div
              key={i}
              onClick={() => instance.namespace && onInstanceClick(instance.namespace)}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                instance.namespace && 'cursor-pointer hover:bg-card/80 transition-colors'
              )}
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-sm font-medium text-foreground">{instance.name}</span>
                  {instance.namespace && (
                    <span className="text-xs text-muted-foreground ml-2">({instance.namespace})</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {instance.creationTimestamp && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(instance.creationTimestamp).toLocaleDateString()}
                  </span>
                )}
                {instance.namespace && (
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.noInstancesFound')}</p>
        </div>
      )}
    </div>
  )
}

interface SchemaTabProps {
  schema: Record<string, unknown> | null
  isLoading: boolean
}

export function CRDSchemaTab({ schema, isLoading }: SchemaTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">OpenAPI Schema</h4>
      {isLoading ? (
        <CenteredSpinner />
      ) : schema ? (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <pre className="text-sm text-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-[60vh]">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Code className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.schemaNotAvailable')}</p>
        </div>
      )}
    </div>
  )
}

interface AITabProps {
  isAgentConnected: boolean
  aiAnalysis: string | null
  aiAnalysisLoading: boolean
  onDiagnose: () => void
}

export function CRDAITab({ isAgentConnected, aiAnalysis, aiAnalysisLoading, onDiagnose }: AITabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
          <ConsoleAIIcon className="w-5 h-5" />
          AI Analysis
        </h4>
        <button
          onClick={onDiagnose}
          disabled={!isAgentConnected}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Stethoscope className="w-4 h-4" />
          Analyze CRD
        </button>
      </div>

      {!isAgentConnected ? (
        <div className="text-center py-12 text-muted-foreground">
          <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>AI agent not connected</p>
          <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
        </div>
      ) : aiAnalysisLoading ? (
        <CenteredSpinner className="text-purple-400" />
      ) : aiAnalysis ? (
        <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <pre className="whitespace-pre-wrap text-sm text-foreground">{aiAnalysis}</pre>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.crd.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
