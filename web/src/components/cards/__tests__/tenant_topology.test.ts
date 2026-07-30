import { describe, it, expect } from 'vitest'
import { DEMO_TENANT_TOPOLOGY } from '../multi-tenancy/tenant-topology/demoData'

describe('DEMO_TENANT_TOPOLOGY', () => {
  it('is defined', () => {
    expect(DEMO_TENANT_TOPOLOGY).toBeDefined()
  })

  it('isDemoData is true', () => {
    expect(DEMO_TENANT_TOPOLOGY.isDemoData).toBe(true)
  })

  it('isLoading is false in demo', () => {
    expect(DEMO_TENANT_TOPOLOGY.isLoading).toBe(false)
  })

  it('all component detected flags are boolean', () => {
    expect(typeof DEMO_TENANT_TOPOLOGY.ovnDetected).toBe('boolean')
    expect(typeof DEMO_TENANT_TOPOLOGY.kubeflexDetected).toBe('boolean')
    expect(typeof DEMO_TENANT_TOPOLOGY.k3sDetected).toBe('boolean')
    expect(typeof DEMO_TENANT_TOPOLOGY.kubevirtDetected).toBe('boolean')
  })

  it('all component healthy flags are boolean', () => {
    expect(typeof DEMO_TENANT_TOPOLOGY.ovnHealthy).toBe('boolean')
    expect(typeof DEMO_TENANT_TOPOLOGY.kubeflexHealthy).toBe('boolean')
    expect(typeof DEMO_TENANT_TOPOLOGY.k3sHealthy).toBe('boolean')
    expect(typeof DEMO_TENANT_TOPOLOGY.kubevirtHealthy).toBe('boolean')
  })

  it('all detected components are healthy in demo', () => {
    if (DEMO_TENANT_TOPOLOGY.ovnDetected) expect(DEMO_TENANT_TOPOLOGY.ovnHealthy).toBe(true)
    if (DEMO_TENANT_TOPOLOGY.kubeflexDetected) expect(DEMO_TENANT_TOPOLOGY.kubeflexHealthy).toBe(true)
    if (DEMO_TENANT_TOPOLOGY.k3sDetected) expect(DEMO_TENANT_TOPOLOGY.k3sHealthy).toBe(true)
    if (DEMO_TENANT_TOPOLOGY.kubevirtDetected) expect(DEMO_TENANT_TOPOLOGY.kubevirtHealthy).toBe(true)
  })

  describe('network rates', () => {
    it('kvEth0Rate equals kvEth0Rx + kvEth0Tx', () => {
      expect(DEMO_TENANT_TOPOLOGY.kvEth0Rate).toBe(
        DEMO_TENANT_TOPOLOGY.kvEth0Rx + DEMO_TENANT_TOPOLOGY.kvEth0Tx,
      )
    })

    it('kvEth1Rate equals kvEth1Rx + kvEth1Tx', () => {
      expect(DEMO_TENANT_TOPOLOGY.kvEth1Rate).toBe(
        DEMO_TENANT_TOPOLOGY.kvEth1Rx + DEMO_TENANT_TOPOLOGY.kvEth1Tx,
      )
    })

    it('k3sEth0Rate equals k3sEth0Rx + k3sEth0Tx', () => {
      expect(DEMO_TENANT_TOPOLOGY.k3sEth0Rate).toBe(
        DEMO_TENANT_TOPOLOGY.k3sEth0Rx + DEMO_TENANT_TOPOLOGY.k3sEth0Tx,
      )
    })

    it('k3sEth1Rate equals k3sEth1Rx + k3sEth1Tx', () => {
      expect(DEMO_TENANT_TOPOLOGY.k3sEth1Rate).toBe(
        DEMO_TENANT_TOPOLOGY.k3sEth1Rx + DEMO_TENANT_TOPOLOGY.k3sEth1Tx,
      )
    })

    it('all rates are non-negative', () => {
      expect(DEMO_TENANT_TOPOLOGY.kvEth0Rate).toBeGreaterThanOrEqual(0)
      expect(DEMO_TENANT_TOPOLOGY.kvEth1Rate).toBeGreaterThanOrEqual(0)
      expect(DEMO_TENANT_TOPOLOGY.k3sEth0Rate).toBeGreaterThanOrEqual(0)
      expect(DEMO_TENANT_TOPOLOGY.k3sEth1Rate).toBeGreaterThanOrEqual(0)
    })

    it('rx and tx values are non-negative', () => {
      const fields = [
        'kvEth0Rx', 'kvEth0Tx', 'kvEth1Rx', 'kvEth1Tx',
        'k3sEth0Rx', 'k3sEth0Tx', 'k3sEth1Rx', 'k3sEth1Tx',
      ] as const
      for (const field of fields) {
        expect(DEMO_TENANT_TOPOLOGY[field]).toBeGreaterThanOrEqual(0)
      }
    })
  })
})
