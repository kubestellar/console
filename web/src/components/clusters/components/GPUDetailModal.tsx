import { useMemo } from 'react'
import { AlertCircle, RefreshCw, Zap } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { useTranslation } from 'react-i18next'
import { DriverInfoPanel } from './DriverInfoPanel'
import { GPUMetricsChart } from './GPUMetricsChart'
import { ProcessTable } from './ProcessTable'
import type { ClusterGPUInfo, GPUDetailModalProps, GPUSpecs, GPUTotals, GPUTypeInfo } from './GPUDetailModal.types'

interface GPUDetailModalInternalProps extends GPUDetailModalProps {
  isOpen?: boolean
}

function extractManufacturer(gpuType: string): string {
  const lower = gpuType.toLowerCase()
  if (lower.includes('nvidia')) return 'NVIDIA'
  if (lower.includes('amd') || lower.includes('radeon')) return 'AMD'
  if (lower.includes('intel')) return 'Intel'
  return 'Unknown'
}

const GPU_UTIL_HIGH = 90
const GPU_UTIL_WARN = 70

function getUtilizationColor(percentage: number): string {
  if (percentage >= GPU_UTIL_HIGH) return 'text-red-400'
  if (percentage >= GPU_UTIL_WARN) return 'text-yellow-400'
  return 'text-green-400'
}

export function GPUDetailModal({
  isOpen = true,
  gpuNodes,
  isLoading,
  error,
  onRefresh,
  onClose,
  operatorStatus,
}: GPUDetailModalInternalProps) {
  const { t } = useTranslation()

  const gpuTypeInfo = useMemo(() => {
    const typeMap = new Map<string, GPUTypeInfo>()

    gpuNodes.forEach(node => {
      const existing = typeMap.get(node.gpuType)
      if (existing) {
        existing.totalGPUs += node.gpuCount
        existing.allocatedGPUs += node.gpuAllocated
        existing.availableGPUs += node.gpuCount - node.gpuAllocated
        existing.nodeCount += 1
        if (!existing.clusters.includes(node.cluster)) existing.clusters.push(node.cluster)
      } else {
        typeMap.set(node.gpuType, {
          type: node.gpuType,
          manufacturer: extractManufacturer(node.gpuType),
          totalGPUs: node.gpuCount,
          allocatedGPUs: node.gpuAllocated,
          availableGPUs: node.gpuCount - node.gpuAllocated,
          nodeCount: 1,
          clusters: [node.cluster],
        })
      }
    })

    return Array.from(typeMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
  }, [gpuNodes])

  const clusterInfo = useMemo(() => {
    const clusterMap = new Map<string, ClusterGPUInfo>()

    gpuNodes.forEach(node => {
      const existing = clusterMap.get(node.cluster)
      if (existing) {
        existing.totalGPUs += node.gpuCount
        existing.allocatedGPUs += node.gpuAllocated
        existing.availableGPUs += node.gpuCount - node.gpuAllocated
        existing.nodeCount += 1
        if (!existing.gpuTypes.includes(node.gpuType)) existing.gpuTypes.push(node.gpuType)
      } else {
        clusterMap.set(node.cluster, {
          cluster: node.cluster,
          totalGPUs: node.gpuCount,
          allocatedGPUs: node.gpuAllocated,
          availableGPUs: node.gpuCount - node.gpuAllocated,
          nodeCount: 1,
          gpuTypes: [node.gpuType],
        })
      }
    })

    return Array.from(clusterMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
  }, [gpuNodes])

  const totals: GPUTotals = (() => {
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
  })()

  const manufacturerBreakdown = (() => {
    const mfgMap = new Map<string, number>()
    gpuTypeInfo.forEach(info => {
      const existing = mfgMap.get(info.manufacturer) || 0
      mfgMap.set(info.manufacturer, existing + info.totalGPUs)
    })
    return Array.from(mfgMap.entries()).sort((a, b) => b[1] - a[1])
  })()

  const gpuSpecs = useMemo((): GPUSpecs => {
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

          <DriverInfoPanel
            gpuSpecs={gpuSpecs}
            operatorStatus={operatorStatus}
            manufacturerBreakdown={manufacturerBreakdown}
          />

          <GPUMetricsChart
            gpuTypeInfo={gpuTypeInfo}
            clusterInfo={clusterInfo}
            getUtilizationColor={getUtilizationColor}
            gpuUtilHigh={GPU_UTIL_HIGH}
            gpuUtilWarn={GPU_UTIL_WARN}
          />

          {gpuNodes.length > 0 && <ProcessTable gpuNodes={gpuNodes} getUtilizationColor={getUtilizationColor} />}

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
