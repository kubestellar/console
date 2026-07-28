import { useMemo } from 'react'
import { Zap, Server, Layers, RefreshCw, Cpu, AlertCircle, CircuitBoard, Settings } from 'lucide-react'
import { GPUNode, NVIDIAOperatorStatus } from '../../../hooks/useMCP'
import { BaseModal } from '../../../lib/modals'
import { useTranslation } from 'react-i18next'
import {
  computeGpuTypeInfo,
  computeClusterInfo,
  computeGpuTotals,
  computeManufacturerBreakdown,
  computeGpuSpecs,
  getUtilizationColor,
} from './gpuDetailUtils'
import { GPUSpecsPanel, NvidiaOperatorStatusPanel } from './GPUSpecsPanel'
import { GPUTypeUtilizationList, GPUClusterUtilizationList } from './GPUUtilizationList'
import { GPUNodesTable } from './GPUNodesTable'

interface GPUDetailModalProps {
  gpuNodes: GPUNode[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  onClose: () => void
  operatorStatus?: NVIDIAOperatorStatus[]
}

interface GPUDetailModalInternalProps extends GPUDetailModalProps {
  isOpen?: boolean
}

export function GPUDetailModal({ isOpen = true, gpuNodes, isLoading, error, onRefresh, onClose, operatorStatus }: GPUDetailModalInternalProps) {
  const { t } = useTranslation()

  const gpuTypeInfo = useMemo(() => computeGpuTypeInfo(gpuNodes), [gpuNodes])
  const clusterInfo = useMemo(() => computeClusterInfo(gpuNodes), [gpuNodes])
  const gpuSpecs = useMemo(() => computeGpuSpecs(gpuNodes), [gpuNodes])
  const totals = computeGpuTotals(gpuNodes)
  const manufacturerBreakdown = computeManufacturerBreakdown(gpuTypeInfo)

  const hasOperatorStatus = operatorStatus && operatorStatus.length > 0 && operatorStatus.some(s => s.gpuOperator || s.networkOperator)
  const hasSpecs = gpuSpecs.totalMemoryGB > 0 || gpuSpecs.families.length > 0 || gpuSpecs.cudaDriverVersions.length > 0

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title="GPU Resources"
        icon={Zap}
        onClose={onClose}
        showBack={false}
        extra={
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50"
            title="Refresh GPU data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <BaseModal.Content className="max-h-[60vh]">
        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 text-yellow-400 text-sm mb-4 p-3 bg-yellow-500/10 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Content */}
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="glass p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-foreground">{totals.total}</div>
              <div className="text-xs text-muted-foreground">{t('common.totalGpus')}</div>
            </div>
            <div className="glass p-4 rounded-lg text-center">
              <div className={`text-3xl font-bold ${getUtilizationColor(totals.utilizationPercent)}`}>
                {totals.allocated}
              </div>
              <div className="text-xs text-muted-foreground">{t('common.allocated')}</div>
            </div>
            <div className="glass p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-green-400">{totals.available}</div>
              <div className="text-xs text-muted-foreground">{t('common.available')}</div>
            </div>
            <div className="glass p-4 rounded-lg text-center">
              <div className={`text-3xl font-bold ${getUtilizationColor(totals.utilizationPercent)}`}>
                {totals.utilizationPercent}%
              </div>
              <div className="text-xs text-muted-foreground">{t('common.utilization')}</div>
            </div>
          </div>

          {/* GPU Specifications */}
          {hasSpecs && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <CircuitBoard className="w-4 h-4" />
                GPU Specifications
              </h4>
              <GPUSpecsPanel gpuSpecs={gpuSpecs} />
            </div>
          )}

          {/* NVIDIA Operator Status */}
          {hasOperatorStatus && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                NVIDIA Operators
              </h4>
              <NvidiaOperatorStatusPanel operatorStatus={operatorStatus!} />
            </div>
          )}

          {/* Manufacturer Breakdown */}
          {manufacturerBreakdown.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Manufacturers
              </h4>
              <div className="flex flex-wrap gap-2">
                {manufacturerBreakdown.map(([mfg, count]) => (
                  <span
                    key={mfg}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                      mfg === 'NVIDIA' ? 'bg-green-500/20 text-green-400' :
                      mfg === 'AMD' ? 'bg-red-500/20 text-red-400' :
                      mfg === 'Intel' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-muted-foreground dark:bg-gray-400/20'
                    }`}
                  >
                    {mfg}: {count} GPUs
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* GPU Types */}
          {gpuTypeInfo.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                GPU Types
              </h4>
              <GPUTypeUtilizationList gpuTypeInfo={gpuTypeInfo} />
            </div>
          )}

          {/* Per-Cluster Breakdown */}
          {clusterInfo.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                By Cluster
              </h4>
              <GPUClusterUtilizationList clusterInfo={clusterInfo} />
            </div>
          )}

          {/* Node Details */}
          {gpuNodes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Server className="w-4 h-4" />
                GPU Nodes ({gpuNodes.length})
              </h4>
              <GPUNodesTable gpuNodes={gpuNodes} />
            </div>
          )}

          {/* Empty state */}
          {gpuNodes.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <div>{t('gpu.noGpuNodesDetected')}</div>
              <div className="text-sm mt-1">{t('gpu.gpuNodesHint')}</div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && gpuNodes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" />
              <p>{t('gpu.loadingData')}</p>
            </div>
          )}
        </div>
      </BaseModal.Content>
    </BaseModal>
  )
}
