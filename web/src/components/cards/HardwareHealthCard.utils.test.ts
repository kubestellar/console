import { describe, it, expect } from 'vitest'
import { isValidElement } from 'react'
import {
  ALERTS_SORT_OPTIONS,
  INVENTORY_SORT_OPTIONS,
  DEFAULT_ALERTS_SORT,
  DEFAULT_INVENTORY_SORT,
  GPU_SORT_WEIGHT,
  CLEAR_ERROR_DISMISS_MS,
  UNKNOWN_SEVERITY_SORT_ORDER,
  extractHostname,
  DeviceIcon,
  getDeviceLabel,
  getTotalDevices,
} from './HardwareHealthCard.utils'
import type { DeviceCounts } from '../../hooks/useCachedGPU'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('sort option constants', () => {
  it('ALERTS_SORT_OPTIONS includes severity, node, cluster, device', () => {
    const values = ALERTS_SORT_OPTIONS.map((o) => o.value)
    expect(values).toEqual(['severity', 'nodeName', 'cluster', 'deviceType'])
  })

  it('INVENTORY_SORT_OPTIONS excludes severity and deviceType (alert-only fields)', () => {
    const values = INVENTORY_SORT_OPTIONS.map((o) => o.value)
    expect(values).not.toContain('severity')
    expect(values).not.toContain('deviceType')
    expect(values).toEqual(['nodeName', 'cluster', 'totalDevices'])
  })

  it('defaults align with each view', () => {
    expect(DEFAULT_ALERTS_SORT).toBe('severity')
    expect(DEFAULT_INVENTORY_SORT).toBe('totalDevices')
  })

  it('default sort values appear in their respective option lists', () => {
    expect(ALERTS_SORT_OPTIONS.some((o) => o.value === DEFAULT_ALERTS_SORT)).toBe(true)
    expect(INVENTORY_SORT_OPTIONS.some((o) => o.value === DEFAULT_INVENTORY_SORT)).toBe(true)
  })

  it('GPU_SORT_WEIGHT is a large positive multiplier so GPU nodes float to the top', () => {
    expect(GPU_SORT_WEIGHT).toBeGreaterThan(1)
    expect(GPU_SORT_WEIGHT).toBe(100)
  })

  it('CLEAR_ERROR_DISMISS_MS is a positive millisecond value', () => {
    expect(CLEAR_ERROR_DISMISS_MS).toBeGreaterThan(0)
    expect(CLEAR_ERROR_DISMISS_MS).toBe(5000)
  })

  it('UNKNOWN_SEVERITY_SORT_ORDER is large so unknowns sort last', () => {
    expect(UNKNOWN_SEVERITY_SORT_ORDER).toBeGreaterThanOrEqual(100)
  })
})

// ---------------------------------------------------------------------------
// extractHostname
// ---------------------------------------------------------------------------

describe('extractHostname', () => {
  it('returns simple node names unchanged', () => {
    expect(extractHostname('worker-1')).toBe('worker-1')
    expect(extractHostname('node01')).toBe('node01')
  })

  it('returns the empty string unchanged (no marker triggers)', () => {
    expect(extractHostname('')).toBe('')
  })

  it('extracts hostname from an API-server style path (last segment)', () => {
    const input = 'https://k8s.example.com:6443/nodes/cluster-worker-abc123'
    expect(extractHostname(input)).toBe('cluster-worker-abc123')
  })

  it('extracts hostname from a service-account style path', () => {
    const input = '/system:serviceaccount:kube-system/my-cluster-gpu-node42'
    expect(extractHostname(input)).toBe('my-cluster-gpu-node42')
  })

  it('falls back to regex when last path segment is too short', () => {
    // Contains :6443/ marker but last segment is very short ("x"). Should
    // fall through to the hostname regex which matches "*-worker-*".
    const input = 'https://api:6443/foo-worker-abc/x'
    expect(extractHostname(input)).toBe('foo-worker-abc')
  })

  it('matches gpu-node style hostnames via regex', () => {
    const input = 'x:6443/y/prod-gpu-node9/z'
    // last segment "z" is too short -> regex kicks in on the full input
    // ("prod-gpu-node9" matches *-gpu-*).
    expect(extractHostname(input)).toBe('prod-gpu-node9')
  })

  it('matches compute-node style hostnames via regex', () => {
    const input = 'x:6443/y/mycluster-compute-nodeA/z'
    expect(extractHostname(input)).toBe('mycluster-compute-nodeA')
  })

  it('returns the original string when no marker and no regex match', () => {
    expect(extractHostname('random-string-with-no-markers')).toBe('random-string-with-no-markers')
  })

  it('returns the original when marker present but no path segment or regex match', () => {
    // Has marker but no matching hostname pattern anywhere -> falls through
    // the `if` and returns original.
    const input = 'foo:6443/'
    expect(extractHostname(input)).toBe(input)
  })
})

// ---------------------------------------------------------------------------
// DeviceIcon
// ---------------------------------------------------------------------------

describe('DeviceIcon', () => {
  it('returns a valid React element for a known device type', () => {
    const el = DeviceIcon({ deviceType: 'gpu', className: 'h-4' })
    expect(isValidElement(el)).toBe(true)
  })

  it('forwards className to the rendered element', () => {
    const el = DeviceIcon({ deviceType: 'gpu', className: 'text-blue' }) as unknown as {
      props: { className?: string }
    }
    expect(el.props.className).toBe('text-blue')
  })

  it.each([
    'gpu',
    'nvme',
    'nic',
    'infiniband',
    'mellanox',
    'sriov',
    'rdma',
    'mofed-driver',
    'gpu-driver',
    'spectrum-scale',
    'unknown-device',
    '',
  ])('returns a valid element for deviceType=%s', (deviceType) => {
    expect(isValidElement(DeviceIcon({ deviceType }))).toBe(true)
  })

  it('picks distinct icon components across icon-group boundaries', () => {
    const gpu = DeviceIcon({ deviceType: 'gpu' }) as unknown as { type: unknown }
    const nvme = DeviceIcon({ deviceType: 'nvme' }) as unknown as { type: unknown }
    const nic = DeviceIcon({ deviceType: 'nic' }) as unknown as { type: unknown }
    const driver = DeviceIcon({ deviceType: 'gpu-driver' }) as unknown as { type: unknown }
    const unknown = DeviceIcon({ deviceType: 'anything-else' }) as unknown as { type: unknown }
    // GPU, NVMe, NIC, driver, and unknown must all be different components.
    const set = new Set([gpu.type, nvme.type, nic.type, driver.type, unknown.type])
    expect(set.size).toBe(5)
  })

  it('groups NIC-family device types under the same icon', () => {
    const nic = DeviceIcon({ deviceType: 'nic' }) as unknown as { type: unknown }
    const infiniband = DeviceIcon({ deviceType: 'infiniband' }) as unknown as { type: unknown }
    const rdma = DeviceIcon({ deviceType: 'rdma' }) as unknown as { type: unknown }
    expect(nic.type).toBe(infiniband.type)
    expect(nic.type).toBe(rdma.type)
  })
})

// ---------------------------------------------------------------------------
// getDeviceLabel
// ---------------------------------------------------------------------------

describe('getDeviceLabel', () => {
  it.each([
    ['gpu', 'GPU'],
    ['nic', 'NIC'],
    ['nvme', 'NVMe'],
    ['infiniband', 'InfiniBand'],
    ['mellanox', 'Mellanox'],
    ['sriov', 'SR-IOV'],
    ['rdma', 'RDMA'],
    ['mofed-driver', 'MOFED Driver'],
    ['gpu-driver', 'GPU Driver'],
    ['spectrum-scale', 'Spectrum Scale'],
  ])('returns %s -> %s', (input, expected) => {
    expect(getDeviceLabel(input)).toBe(expected)
  })

  it('uppercases unknown device types as a fallback', () => {
    expect(getDeviceLabel('foobar')).toBe('FOOBAR')
    expect(getDeviceLabel('tpu')).toBe('TPU')
  })

  it('returns empty string uppercased (still empty) for empty input', () => {
    expect(getDeviceLabel('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getTotalDevices
// ---------------------------------------------------------------------------

function makeCounts(overrides: Partial<DeviceCounts> = {}): DeviceCounts {
  return {
    gpuCount: 0,
    nicCount: 0,
    nvmeCount: 0,
    infinibandCount: 0,
    sriovCapable: false,
    rdmaAvailable: false,
    mellanoxPresent: false,
    nvidiaNicPresent: false,
    spectrumScale: false,
    mofedReady: false,
    gpuDriverReady: false,
    ...overrides,
  }
}

describe('getTotalDevices', () => {
  it('returns 0 when all counts are zero', () => {
    expect(getTotalDevices(makeCounts())).toBe(0)
  })

  it('sums gpu, nic, nvme, and infiniband counts', () => {
    const counts = makeCounts({ gpuCount: 8, nicCount: 4, nvmeCount: 2, infinibandCount: 3 })
    expect(getTotalDevices(counts)).toBe(17)
  })

  it('does not include boolean capability flags in the total', () => {
    const counts = makeCounts({
      gpuCount: 1,
      sriovCapable: true,
      rdmaAvailable: true,
      mellanoxPresent: true,
      nvidiaNicPresent: true,
      spectrumScale: true,
      mofedReady: true,
      gpuDriverReady: true,
    })
    expect(getTotalDevices(counts)).toBe(1)
  })
})
