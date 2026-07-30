import { useState } from 'react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { Loader2, Copy, Check } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { usePVCDrillDown } from './usePVCDrillDown'
import {
  type TabType,
  getStatusColor,
  getTabs,
  CopyButton,
  PVCDrillDownHeader,
  PVCTabBar,
  LabelsSection,
  AnnotationsSection,
  Info,
  Database,
  Server,
  Layers,
} from './PVCDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

export function PVCDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const pvcName = data.pvc as string
  const { drillToNamespace, drillToCluster } = useDrillDownActions()
  const { state, pop } = useDrillDown()

  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const {
    status,
    capacity,
    accessModes,
    storageClass,
    volumeName,
    volumeMode,
    labels,
    annotations,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    copiedField,
    isLoading,
    handleCopy,
    fetchDescribe,
    fetchYaml,
    agentConnected,
  } = usePVCDrillDown(cluster, namespace, pvcName, data)

  const statusColor = getStatusColor(status)
  const tabs = getTabs(t)

  return (
    <div className="space-y-4">
      <PVCDrillDownHeader
        pvcName={pvcName}
        status={status}
        statusColor={statusColor}
        isLoading={isLoading}
        cluster={cluster}
        namespace={namespace}
        canGoBack={state.stack.length > 1}
        onBack={pop}
        onClusterClick={() => drillToCluster(cluster)}
        onNamespaceClick={() => drillToNamespace(cluster, namespace)}
      />

      {/* Tabs */}
      <PVCTabBar
        activeTab={activeTab}
        tabs={tabs}
        onSelect={setActiveTab}
        describeOutput={describeOutput}
        yamlOutput={yamlOutput}
        fetchDescribe={fetchDescribe}
        fetchYaml={fetchYaml}
      />

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Key details grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-400" />
                {t('drilldown.details', 'Details')}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.status', 'Status')}</span>
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', statusColor)}>
                    {status || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.capacity', 'Capacity')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground font-mono">{capacity || 'N/A'}</span>
                    {capacity && <CopyButton text={capacity} field="capacity" />}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.accessModes', 'Access Modes')}</span>
                  <div className="flex items-center gap-1">
                    {(accessModes || []).length > 0 ? (
                      <div className="flex gap-1">
                        {accessModes.map(mode => (
                          <span key={mode} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-mono">
                            {mode}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.volumeMode', 'Volume Mode')}</span>
                  <span className="text-foreground">{volumeMode || 'Filesystem'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Database className="w-4 h-4 text-green-400" />
                {t('drilldown.storageInfo', 'Storage Info')}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.storageClass', 'Storage Class')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground font-mono">{storageClass || 'default'}</span>
                    {storageClass && <CopyButton text={storageClass} field="storageClass" />}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.boundVolume', 'Bound Volume')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground font-mono text-xs">{volumeName || 'Unbound'}</span>
                    {volumeName && <CopyButton text={volumeName} field="volumeName" />}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.cluster', 'Cluster')}</span>
                  <button
                    onClick={() => drillToCluster(cluster)}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span className="text-xs">{cluster}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.namespace', 'Namespace')}</span>
                  <button
                    onClick={() => drillToNamespace(cluster, namespace)}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span className="text-xs">{namespace}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Labels */}
          {labels && Object.keys(labels).length > 0 && (
            <LabelsSection labels={labels} />
          )}

          {/* Annotations */}
          {annotations && Object.keys(annotations).length > 0 && (
            <AnnotationsSection annotations={annotations} />
          )}
        </div>
      )}

      {activeTab === 'describe' && (
        <div className="space-y-2">
          {!agentConnected ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.agentRequiredDescribe', 'Connect kc-agent to run kubectl describe')}</p>
            </div>
          ) : describeLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : describeOutput ? (
            <div className="relative">
              <button
                onClick={() => void handleCopy(describeOutput, 'describe')}
                className="absolute top-2 right-2 p-1.5 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedField === 'describe' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre className="p-4 rounded-lg bg-secondary/30 border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-[50vh]">
                {describeOutput}
              </pre>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.clickToFetchDescribe', 'Loading describe output...')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'yaml' && (
        <div className="space-y-2">
          {!agentConnected ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.agentRequiredYaml', 'Connect kc-agent to view YAML')}</p>
            </div>
          ) : yamlLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : yamlOutput ? (
            <div className="relative">
              <button
                onClick={() => void handleCopy(yamlOutput, 'yaml')}
                className="absolute top-2 right-2 p-1.5 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedField === 'yaml' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre className="p-4 rounded-lg bg-secondary/30 border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-[50vh]">
                {yamlOutput}
              </pre>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.clickToFetchYaml', 'Loading YAML...')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PVCDrillDown
