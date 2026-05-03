import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTenantIsolationSetup } from '../useTenantIsolationSetup'

const mockUseOvnStatus = vi.fn()
const mockUseKubeFlexStatus = vi.fn()
const mockUseK3sStatus = vi.fn()
const mockUseKubevirtStatus = vi.fn()

vi.mock('../../ovn-status/useOvnStatus', () => ({
  useOvnStatus: () => mockUseOvnStatus(),
}))

vi.mock('../../kubeflex-status/useKubeflexStatus', () => ({
  useKubeFlexStatus: () => mockUseKubeFlexStatus(),
}))

vi.mock('../../k3s-status/useK3sStatus', () => ({
  useK3sStatus: () => mockUseK3sStatus(),
}))

vi.mock('../../kubevirt-status/useKubevirtStatus', () => ({
  useKubevirtStatus: () => mockUseKubevirtStatus(),
}))

function setStatusMocks({
  ovn,
  kubeflex,
  k3s,
  kubevirt,
}: {
  ovn: { detected: boolean, health: string, loading?: boolean, isDemoData?: boolean }
  kubeflex: { detected: boolean, health: string, loading?: boolean, isDemoData?: boolean }
  k3s: { detected: boolean, health: string, loading?: boolean, isDemoData?: boolean }
  kubevirt: { detected: boolean, health: string, loading?: boolean, isDemoData?: boolean }
}) {
  mockUseOvnStatus.mockReturnValue({
    data: { detected: ovn.detected, health: ovn.health },
    loading: ovn.loading ?? false,
    isDemoData: ovn.isDemoData ?? false,
  })
  mockUseKubeFlexStatus.mockReturnValue({
    data: { detected: kubeflex.detected, health: kubeflex.health },
    loading: kubeflex.loading ?? false,
    isDemoData: kubeflex.isDemoData ?? false,
  })
  mockUseK3sStatus.mockReturnValue({
    data: { detected: k3s.detected, health: k3s.health },
    loading: k3s.loading ?? false,
    isDemoData: k3s.isDemoData ?? false,
  })
  mockUseKubevirtStatus.mockReturnValue({
    data: { detected: kubevirt.detected, health: kubevirt.health },
    loading: kubevirt.loading ?? false,
    isDemoData: kubevirt.isDemoData ?? false,
  })
}

describe('useTenantIsolationSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes readiness and isolation when all components are healthy', () => {
    setStatusMocks({
      ovn: { detected: true, health: 'healthy' },
      kubeflex: { detected: true, health: 'healthy' },
      k3s: { detected: true, health: 'healthy' },
      kubevirt: { detected: true, health: 'healthy' },
    })

    const result = useTenantIsolationSetup()

    expect(result.readyCount).toBe(4)
    expect(result.totalComponents).toBe(4)
    expect(result.allReady).toBe(true)
    expect(result.isolationScore).toBe(3)
    expect(result.isolationLevels.map((level) => level.status)).toEqual(['ready', 'ready', 'ready'])
    expect(result.isLoading).toBe(false)
    expect(result.isDemoData).toBe(false)
  })

  it('marks control plane as degraded when one component is unhealthy', () => {
    setStatusMocks({
      ovn: { detected: true, health: 'healthy' },
      kubeflex: { detected: true, health: 'healthy' },
      k3s: { detected: true, health: 'degraded' },
      kubevirt: { detected: false, health: 'unknown' },
    })

    const result = useTenantIsolationSetup()

    expect(result.readyCount).toBe(3)
    expect(result.allReady).toBe(false)
    expect(result.isolationLevels).toEqual([
      { type: 'Control-plane', status: 'degraded', provider: 'KubeFlex + K3s' },
      { type: 'Data-plane', status: 'missing', provider: 'KubeVirt' },
      { type: 'Network', status: 'ready', provider: 'OVN-Kubernetes' },
    ])
    expect(result.isolationScore).toBe(1)
  })

  it('combines loading and demo flags across all sources', () => {
    setStatusMocks({
      ovn: { detected: true, health: 'healthy', loading: false, isDemoData: true },
      kubeflex: { detected: true, health: 'healthy', loading: true, isDemoData: true },
      k3s: { detected: true, health: 'healthy', loading: false, isDemoData: true },
      kubevirt: { detected: true, health: 'healthy', loading: false, isDemoData: false },
    })

    const result = useTenantIsolationSetup()

    expect(result.isLoading).toBe(true)
    expect(result.isDemoData).toBe(false)
    expect(result.totalIsolationLevels).toBe(3)
  })
})
