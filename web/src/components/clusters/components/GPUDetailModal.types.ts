import type { GPUNode, NVIDIAOperatorStatus } from '../../../hooks/useMCP'

export interface GPUDetailModalProps {
  gpuNodes: GPUNode[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  onClose: () => void
  operatorStatus?: NVIDIAOperatorStatus[]
}

export interface GPUTypeInfo {
  type: string
  manufacturer: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  clusters: string[]
}

export interface ClusterGPUInfo {
  cluster: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  gpuTypes: string[]
}

export interface GPUTotals {
  total: number
  allocated: number
  available: number
  utilizationPercent: number
}

export interface GPUSpecs {
  totalMemoryGB: number
  families: string[]
  cudaDriverVersions: string[]
  cudaRuntimeVersions: string[]
  migCapableCount: number
}
