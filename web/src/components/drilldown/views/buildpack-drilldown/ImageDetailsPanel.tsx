import { AlertCircle, Check, Clock, Copy, GitBranch, Loader2, Package, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BuildpackStatus, KpackBuild, KpackCondition, KpackImageStatus } from './types'

interface ImageDetailsPanelProps {
  loading: boolean
  name: string
  status: BuildpackStatus
  imageInfo: KpackImageStatus | null
  builds: KpackBuild[]
  builder: string
  copiedField: string | null
  onCopy: (field: string, value: string) => void
}

export function ImageDetailsPanel({
  loading,
  name,
  status,
  imageInfo,
  builds,
  builder,
  copiedField,
  onCopy,
}: ImageDetailsPanelProps) {
  const { t } = useTranslation()
  const latestImage = imageInfo?.status?.latestImage || 'N/A'
  const conditions = imageInfo?.status?.conditions || []
  const readyCondition = conditions.find((c: KpackCondition) => c.type === 'Ready')
  const builderImage = imageInfo?.spec?.builder?.image || builder

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-start gap-3">
              <Package className="w-8 h-8 text-green-400 mt-1" />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-foreground">{name}</h3>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4" />
                    <span>Builder: {builderImage?.split('/').pop()?.split(':')[0] || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4" />
                    <span>Status: {readyCondition?.status || status}</span>
                  </div>
                </div>
                {imageInfo?.metadata?.creationTimestamp && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Created: {new Date(imageInfo.metadata.creationTimestamp).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="text-2xl font-bold text-foreground">{builds.length}</div>
              <div className="text-xs text-muted-foreground">Total Builds</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="text-2xl font-bold text-foreground">
                {builds.filter((b) => {
                  const condition = b.status?.conditions?.find((c: KpackCondition) => c.type === 'Succeeded')
                  return condition?.status === 'True'
                }).length}
              </div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="text-2xl font-bold text-foreground">{conditions.length}</div>
              <div className="text-xs text-muted-foreground">Conditions</div>
            </div>
          </div>

          {latestImage !== 'N/A' && (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-foreground">Latest Image</h4>
                <button
                  type="button"
                  onClick={() => onCopy('image', latestImage)}
                  aria-label={t('actions.copy')}
                  className="p-1 min-h-11 min-w-11 flex items-center justify-center hover:bg-secondary rounded"
                >
                  {copiedField === 'image' ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-muted-foreground break-all">{latestImage}</pre>
            </div>
          )}

          {conditions.length > 0 && (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h4 className="text-sm font-medium text-foreground mb-3">Conditions</h4>
              <div className="space-y-2">
                {conditions.map((condition: KpackCondition, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-card/50">
                    <div className="flex items-center gap-2">
                      {condition.status === 'True' ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : condition.status === 'False' ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-400" />
                      )}
                      <span className="text-sm text-foreground">{condition.type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{condition.status}</span>
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
