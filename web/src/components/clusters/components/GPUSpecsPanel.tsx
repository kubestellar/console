import { Cpu, HardDrive, Settings, Layers } from 'lucide-react'
import type { NVIDIAOperatorStatus } from '../../../hooks/useMCP'
import { wrapAbbreviations } from '../../shared/TechnicalAcronym'
import type { GPUSpecs } from './gpuDetailUtils'

interface GPUSpecsPanelProps {
  gpuSpecs: GPUSpecs
}

/**
 * Renders the "GPU Specifications" card grid (VRAM, architecture, CUDA
 * driver version, MIG support). Extracted from GPUDetailModal.tsx
 * (#21613) to reduce the parent component's line count.
 */
export function GPUSpecsPanel({ gpuSpecs }: GPUSpecsPanelProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {gpuSpecs.totalMemoryGB > 0 && (
        <div className="glass p-3 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <HardDrive className="w-3 h-3" />
            {wrapAbbreviations('Total VRAM')}
          </div>
          <div className="text-lg font-bold text-foreground">{gpuSpecs.totalMemoryGB} GB</div>
        </div>
      )}
      {gpuSpecs.families.length > 0 && (
        <div className="glass p-3 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Cpu className="w-3 h-3" />
            Architecture
          </div>
          <div className="text-sm font-medium text-foreground capitalize">
            {(gpuSpecs.families || []).join(', ')}
          </div>
        </div>
      )}
      {gpuSpecs.cudaDriverVersions.length > 0 && (
        <div className="glass p-3 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Settings className="w-3 h-3" />
            {wrapAbbreviations('CUDA Driver')}
          </div>
          <div className="text-sm font-medium text-foreground">
            {(gpuSpecs.cudaDriverVersions || []).join(', ')}
          </div>
        </div>
      )}
      {gpuSpecs.migCapableCount > 0 && (
        <div className="glass p-3 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Layers className="w-3 h-3" />
            {wrapAbbreviations('MIG Capable')}
          </div>
          <div className="text-lg font-bold text-purple-400">{gpuSpecs.migCapableCount}</div>
        </div>
      )}
    </div>
  )
}

interface NvidiaOperatorStatusPanelProps {
  operatorStatus: NVIDIAOperatorStatus[]
}

/**
 * Renders the "NVIDIA Operators" status section. Extracted from
 * GPUDetailModal.tsx (#21613) to reduce the parent component's line count.
 */
export function NvidiaOperatorStatusPanel({ operatorStatus }: NvidiaOperatorStatusPanelProps) {
  return (
    <div className="space-y-2">
      {operatorStatus.map(status => (
        <div key={status.cluster} className="glass p-3 rounded-lg">
          <div className="text-sm font-medium text-foreground mb-2">{status.cluster}</div>
          <div className="flex flex-wrap gap-2">
            {status.gpuOperator && (
              <span className={`px-2 py-1 rounded text-xs ${
                status.gpuOperator.ready
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                GPU Operator: {status.gpuOperator.state || (status.gpuOperator.ready ? 'Ready' : 'Not Ready')}
                {status.gpuOperator.driverVersion && ` (${status.gpuOperator.driverVersion})`}
              </span>
            )}
            {status.networkOperator && (
              <span className={`px-2 py-1 rounded text-xs ${
                status.networkOperator.ready
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                Network Operator: {status.networkOperator.state || (status.networkOperator.ready ? 'Ready' : 'Not Ready')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
