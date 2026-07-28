import { CircuitBoard, Cpu, HardDrive, Layers, Settings } from 'lucide-react'
import { wrapAbbreviations } from '../../shared/TechnicalAcronym'
import type { GPUSpecs } from './GPUDetailModal.types'
import type { NVIDIAOperatorStatus } from '../../../hooks/useMCP'

interface DriverInfoPanelProps {
  gpuSpecs: GPUSpecs
  operatorStatus?: NVIDIAOperatorStatus[]
  manufacturerBreakdown: Array<[string, number]>
}

export function DriverInfoPanel({ gpuSpecs, operatorStatus, manufacturerBreakdown }: DriverInfoPanelProps) {
  return (
    <>
      {(gpuSpecs.totalMemoryGB > 0 || gpuSpecs.families.length > 0 || gpuSpecs.cudaDriverVersions.length > 0) && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <CircuitBoard className="w-4 h-4" />
            GPU Specifications
          </h4>
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
                <div className="text-sm font-medium text-foreground capitalize">{(gpuSpecs.families || []).join(', ')}</div>
              </div>
            )}
            {gpuSpecs.cudaDriverVersions.length > 0 && (
              <div className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Settings className="w-3 h-3" />
                  {wrapAbbreviations('CUDA Driver')}
                </div>
                <div className="text-sm font-medium text-foreground">{(gpuSpecs.cudaDriverVersions || []).join(', ')}</div>
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
        </div>
      )}

      {operatorStatus && operatorStatus.length > 0 && operatorStatus.some(s => s.gpuOperator || s.networkOperator) && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            NVIDIA Operators
          </h4>
          <div className="space-y-2">
            {operatorStatus.map(status => (
              <div key={status.cluster} className="glass p-3 rounded-lg">
                <div className="text-sm font-medium text-foreground mb-2">{status.cluster}</div>
                <div className="flex flex-wrap gap-2">
                  {status.gpuOperator && (
                    <span className={`px-2 py-1 rounded text-xs ${status.gpuOperator.ready ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      GPU Operator: {status.gpuOperator.state || (status.gpuOperator.ready ? 'Ready' : 'Not Ready')}
                      {status.gpuOperator.driverVersion && ` (${status.gpuOperator.driverVersion})`}
                    </span>
                  )}
                  {status.networkOperator && (
                    <span className={`px-2 py-1 rounded text-xs ${status.networkOperator.ready ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      Network Operator: {status.networkOperator.state || (status.networkOperator.ready ? 'Ready' : 'Not Ready')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {manufacturerBreakdown.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Manufacturers
          </h4>
          <div className="flex flex-wrap gap-2">
            {manufacturerBreakdown.map(([manufacturer, count]) => (
              <span
                key={manufacturer}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  manufacturer === 'NVIDIA'
                    ? 'bg-green-500/20 text-green-400'
                    : manufacturer === 'AMD'
                    ? 'bg-red-500/20 text-red-400'
                    : manufacturer === 'Intel'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-500/20 text-muted-foreground dark:bg-gray-400/20'
                }`}
              >
                {manufacturer}: {count} GPUs
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
