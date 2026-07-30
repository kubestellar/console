import { createElement } from 'react'
import { AlertTriangle, Cpu, HardDrive, Server, Wifi } from 'lucide-react'
import type { SortField } from './HardwareHealthCard.types'
import type { DeviceCounts } from '../../hooks/useCachedData'

/** Sort options applicable to the Alerts view */
export const ALERTS_SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'nodeName', label: 'Node' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'deviceType', label: 'Device' },
]

/** Sort options applicable to the Inventory view (no severity/device — those are alert-only concepts) */
export const INVENTORY_SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'nodeName', label: 'Node' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'totalDevices', label: 'Total Devices' },
]

/** Default sort field for each view */
export const DEFAULT_ALERTS_SORT: SortField = 'severity'
export const DEFAULT_INVENTORY_SORT: SortField = 'totalDevices'

/** Weight multiplier so GPU-heavy nodes sort above nodes with only other device types */
export const GPU_SORT_WEIGHT = 100

/** Auto-dismiss delay for alert clear error messages (ms) */
export const CLEAR_ERROR_DISMISS_MS = 5000

/** Fallback sort order value for unknown severities (ensures they sort last) */
export const UNKNOWN_SEVERITY_SORT_ORDER = 999

const NODE_HOSTNAME_PATTERN =
  /([a-z0-9-]+-worker-[a-z0-9-]+|[a-z0-9-]+-gpu-[a-z0-9-]+|[a-z0-9-]+-compute-[a-z0-9-]+)/i
const MIN_HOSTNAME_LENGTH = 5

/** Extract canonical hostname from node name.
 * Handles both short names and long API/SA paths. */
export function extractHostname(nodeName: string): string {
  if (nodeName.includes(':6443/') || nodeName.includes('/system:serviceaccount:')) {
    const parts = nodeName.split('/')
    const lastPart = parts[parts.length - 1]
    if (lastPart && !lastPart.includes(':') && lastPart.length > MIN_HOSTNAME_LENGTH) {
      return lastPart
    }
    const match = nodeName.match(NODE_HOSTNAME_PATTERN)
    if (match) {
      return match[1]
    }
  }
  return nodeName
}

export function DeviceIcon({ deviceType, className }: { deviceType: string; className?: string }) {
  switch (deviceType) {
    case 'gpu':
      return createElement(Cpu, { className })
    case 'nvme':
      return createElement(HardDrive, { className })
    case 'nic':
    case 'infiniband':
    case 'mellanox':
    case 'sriov':
    case 'rdma':
      return createElement(Wifi, { className })
    case 'mofed-driver':
    case 'gpu-driver':
    case 'spectrum-scale':
      return createElement(Server, { className })
    default:
      return createElement(AlertTriangle, { className })
  }
}

/** Get human-readable device type label */
export function getDeviceLabel(deviceType: string): string {
  const labels: Record<string, string> = {
    gpu: 'GPU',
    nic: 'NIC',
    nvme: 'NVMe',
    infiniband: 'InfiniBand',
    mellanox: 'Mellanox',
    sriov: 'SR-IOV',
    rdma: 'RDMA',
    'mofed-driver': 'MOFED Driver',
    'gpu-driver': 'GPU Driver',
    'spectrum-scale': 'Spectrum Scale',
  }
  return labels[deviceType] || deviceType.toUpperCase()
}

/** Sum all device counts for a node */
export function getTotalDevices(devices: DeviceCounts): number {
  return devices.gpuCount + devices.nicCount + devices.nvmeCount + devices.infinibandCount
}
