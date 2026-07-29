import { useMemo } from 'react'
import { Zap, RefreshCw, AlertCircle } from 'lucide-react'
import type { GPUNode, NVIDIAOperatorStatus } from '../../../hooks/useMCP'
import { BaseModal } from '../../../lib/modals'
import { useTranslation } from 'react-i18next'
import { buildGpuTypeInfo, buildClusterInfo } from './GPUDetailModal.utils'
import { GPUSummaryStats, DriverInfoPanel, GPUMetricsChart, ClusterBreakdownPanel, ProcessTable } from './GPUDetailModal.parts'

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

  const gpuTypeInfo = useMemo(() => buildGpuTypeInfo(gpuNodes), [gpuNodes])
  const clusterInfo = useMemo(() => buildClusterInfo(gpuNodes), [gpuNodes])

  const totals = useMemo(() => {
    let total = 0
    let allocated = 0
    gpuNodes.forEach(node => {
      total += node.gpuCount
      allocated += node.gpuAllocated
    })
    return {
      total,
      allocated,
      available: total - allocated,
      utilizationPercent: total > 0 ? Math.round((allocated / total) * 100) : 0,
    }
  }, [gpuNodes])

  const manufacturerBreakdown = useMemo(() => {
    const mfgMap = new Map<string, number>()
    gpuTypeInfo.forEach(info => {
      const existing = mfgMap.get(info.manufacturer) || 0
      mfgMap.set(info.manufacturer, existing + info.totalGPUs)
    })
    return Array.from(mfgMap.entries()).sort((a, b) => b[1] - a[1])
  }, [gpuTypeInfo])

  const gpuSpecs = useMemo(() => {
    const specs = {
      totalMemoryGB: 0,
      families: new Set<string>(),
      cudaDriverVersions: new Set<string>(),
      cudaRuntimeVersions: new Set<string>(),
      migCapableCount: 0,
    }
    gpuNodes.forEach(node => {
      if (node.gpuMemoryMB) specs.totalMemoryGB += (node.gpuMemoryMB / 1024) * node.gpuCount
      if (node.gpuFamily) specs.families.add(node.gpuFamily)
      if (node.cudaDriverVersion) specs.cudaDriverVersions.add(node.cudaDriverVersion)
      if (node.cudaRuntimeVersion) specs.cudaRuntimeVersions.add(node.cudaRuntimeVersion)
      if (node.migCapable) specs.migCapableCount += node.gpuCount
    })
    return {
      totalMemoryGB: Math.round(specs.totalMemoryGB),
      families: Array.from(specs.families),
      cudaDriverVersions: Array.from(specs.cudaDriverVersions),
      cudaRuntimeVersions: Array.from(specs.cudaRuntimeVersions),
      migCapableCount: specs.migCapableCount,
    }
  }, [gpuNodes])

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
        {error && (
          <div className="flex items-center gap-2 text-yellow-400 text-sm mb-4 p-3 bg-yellow-500/10 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="space-y-6">
          <GPUSummaryStats
            total={totals.total}
            allocated={totals.allocated}
            available={totals.available}
            utilizationPercent={totals.utilizationPercent}
          />

          <DriverInfoPanel
            specs={gpuSpecs}
            operatorStatus={operatorStatus}
            manufacturerBreakdown={manufacturerBreakdown}
          />

          <GPUMetricsChart gpuTypeInfo={gpuTypeInfo} />

          <ClusterBreakdownPanel clusterInfo={clusterInfo} />

          <ProcessTable gpuNodes={gpuNodes} />

          {gpuNodes.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <div>{t('gpu.noGpuNodesDetected')}</div>
              <div className="text-sm mt-1">{t('gpu.gpuNodesHint')}</div>
            </div>
          )}

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
