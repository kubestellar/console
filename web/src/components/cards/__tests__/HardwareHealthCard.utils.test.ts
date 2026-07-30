import { describe, it, expect } from 'vitest'
import {
  ALERTS_SORT_OPTIONS,
  INVENTORY_SORT_OPTIONS,
  DEFAULT_ALERTS_SORT,
  DEFAULT_INVENTORY_SORT,
  GPU_SORT_WEIGHT,
  CLEAR_ERROR_DISMISS_MS,
  UNKNOWN_SEVERITY_SORT_ORDER,
  extractHostname,
  getDeviceLabel,
  getTotalDevices,
} from '../HardwareHealthCard.utils'

// ─── Constants ───────────────────────────────────────────────────────────────

describe('HardwareHealthCard.utils constants', () => {
  it('ALERTS_SORT_OPTIONS has 4 options', () => {
    expect(ALERTS_SORT_OPTIONS).toHaveLength(4)
    expect(ALERTS_SORT_OPTIONS.map(o => o.value)).toEqual(['severity', 'nodeName', 'cluster', 'deviceType'])
  })

  it('INVENTORY_SORT_OPTIONS has 3 options', () => {
    expect(INVENTORY_SORT_OPTIONS).toHaveLength(3)
    expect(INVENTORY_SORT_OPTIONS.map(o => o.value)).toContain('totalDevices')
  })

  it('DEFAULT_ALERTS_SORT is severity', () => {
    expect(DEFAULT_ALERTS_SORT).toBe('severity')
  })

  it('DEFAULT_INVENTORY_SORT is totalDevices', () => {
    expect(DEFAULT_INVENTORY_SORT).toBe('totalDevices')
  })

  it('GPU_SORT_WEIGHT is 100', () => {
    expect(GPU_SORT_WEIGHT).toBe(100)
  })

  it('CLEAR_ERROR_DISMISS_MS is 5000', () => {
    expect(CLEAR_ERROR_DISMISS_MS).toBe(5000)
  })

  it('UNKNOWN_SEVERITY_SORT_ORDER is 999', () => {
    expect(UNKNOWN_SEVERITY_SORT_ORDER).toBe(999)
  })
})

// ─── extractHostname ─────────────────────────────────────────────────────────

describe('extractHostname', () => {
  it('returns simple node name unchanged', () => {
    expect(extractHostname('worker-node-1')).toBe('worker-node-1')
  })

  it('extracts hostname from API server path', () => {
    expect(extractHostname('https://10.0.0.1:6443/apis/node/v1/worker-gpu-node01')).toBe('worker-gpu-node01')
  })

  it('extracts hostname from service account path', () => {
    expect(extractHostname('https://10.0.0.1:6443/system:serviceaccount:kube-system/large-worker-compute-abcde')).toBe('large-worker-compute-abcde')
  })

  it('uses regex pattern for worker hostname in path', () => {
    expect(extractHostname('https://10.0.0.1:6443/something/with:colons/abc-worker-xyz123')).toBe('abc-worker-xyz123')
  })

  it('uses regex pattern for gpu hostname in path', () => {
    expect(extractHostname('https://api:6443/path/to/node-gpu-abc123')).toBe('node-gpu-abc123')
  })

  it('uses regex pattern for compute hostname in path', () => {
    expect(extractHostname('https://api:6443/path/to/cluster-compute-def456')).toBe('cluster-compute-def456')
  })

  it('returns full string if no patterns match in API path', () => {
    // If last part has colons or is too short, and no regex match, returns original
    expect(extractHostname('short')).toBe('short')
  })
})

// ─── getDeviceLabel ──────────────────────────────────────────────────────────

describe('getDeviceLabel', () => {
  it('returns GPU for gpu', () => {
    expect(getDeviceLabel('gpu')).toBe('GPU')
  })

  it('returns NIC for nic', () => {
    expect(getDeviceLabel('nic')).toBe('NIC')
  })

  it('returns NVMe for nvme', () => {
    expect(getDeviceLabel('nvme')).toBe('NVMe')
  })

  it('returns InfiniBand for infiniband', () => {
    expect(getDeviceLabel('infiniband')).toBe('InfiniBand')
  })

  it('returns Mellanox for mellanox', () => {
    expect(getDeviceLabel('mellanox')).toBe('Mellanox')
  })

  it('returns SR-IOV for sriov', () => {
    expect(getDeviceLabel('sriov')).toBe('SR-IOV')
  })

  it('returns RDMA for rdma', () => {
    expect(getDeviceLabel('rdma')).toBe('RDMA')
  })

  it('returns MOFED Driver for mofed-driver', () => {
    expect(getDeviceLabel('mofed-driver')).toBe('MOFED Driver')
  })

  it('returns GPU Driver for gpu-driver', () => {
    expect(getDeviceLabel('gpu-driver')).toBe('GPU Driver')
  })

  it('returns Spectrum Scale for spectrum-scale', () => {
    expect(getDeviceLabel('spectrum-scale')).toBe('Spectrum Scale')
  })

  it('uppercases unknown device types', () => {
    expect(getDeviceLabel('custom-device')).toBe('CUSTOM-DEVICE')
    expect(getDeviceLabel('foo')).toBe('FOO')
  })
})

// ─── getTotalDevices ─────────────────────────────────────────────────────────

describe('getTotalDevices', () => {
  it('sums all device counts', () => {
    expect(getTotalDevices({
      gpuCount: 4,
      nicCount: 2,
      nvmeCount: 8,
      infinibandCount: 1,
      sriovCapable: true,
      rdmaAvailable: false,
    })).toBe(15)
  })

  it('returns 0 for all-zero counts', () => {
    expect(getTotalDevices({
      gpuCount: 0,
      nicCount: 0,
      nvmeCount: 0,
      infinibandCount: 0,
      sriovCapable: false,
      rdmaAvailable: false,
    })).toBe(0)
  })

  it('handles single device type', () => {
    expect(getTotalDevices({
      gpuCount: 8,
      nicCount: 0,
      nvmeCount: 0,
      infinibandCount: 0,
      sriovCapable: false,
      rdmaAvailable: false,
    })).toBe(8)
  })
})
