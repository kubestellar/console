import { describe, it, expect } from 'vitest'
import {
  deriveServiceHealth,
  isOrphaned,
  hasInvalidSelector,
  hasSelector,
  formatServicePort,
  formatServicePorts,
} from '../serviceHealth'
import {
  LB_STATUS_PROVISIONING,
  LB_STATUS_READY,
} from '../../constants/network'

describe('deriveServiceHealth', () => {
  it("returns 'healthy' when endpoints > 0", () => {
    expect(
      deriveServiceHealth({
        type: 'ClusterIP',
        endpoints: 3,
        selector: { app: 'web' },
      }),
    ).toBe('healthy')
  })

  it("returns 'orphaned' when selector exists and endpoints === 0 (#6164/#6165)", () => {
    expect(
      deriveServiceHealth({
        type: 'ClusterIP',
        endpoints: 0,
        selector: { app: 'missing' },
      }),
    ).toBe('orphaned')
  })

  it("returns 'provisioning' for a LoadBalancer without ingress (#6167)", () => {
    expect(
      deriveServiceHealth({
        type: 'LoadBalancer',
        endpoints: 0,
        selector: { app: 'web' },
        lbStatus: LB_STATUS_PROVISIONING,
      }),
    ).toBe('provisioning')
  })

  it("provisioning wins over orphaned when LB has zero endpoints", () => {
    // A fresh LoadBalancer with no endpoints yet is NOT orphaned —
    // it is still coming up.
    expect(
      isOrphaned({
        endpoints: 0,
        selector: { app: 'web' },
        lbStatus: LB_STATUS_PROVISIONING,
      }),
    ).toBe(false)
  })

  it("returns 'healthy' for a ready LoadBalancer with endpoints", () => {
    expect(
      deriveServiceHealth({
        type: 'LoadBalancer',
        endpoints: 2,
        selector: { app: 'web' },
        lbStatus: LB_STATUS_READY,
      }),
    ).toBe('healthy')
  })

  it("returns 'unknown' when endpoints is undefined", () => {
    expect(
      deriveServiceHealth({
        type: 'ClusterIP',
        selector: { app: 'web' },
      }),
    ).toBe('unknown')
  })

  it("returns 'unknown' when endpoints === 0 but no selector (headless)", () => {
    // No selector means pods are managed externally; we cannot prove
    // the service is unreachable, so do NOT flag as orphaned.
    expect(
      deriveServiceHealth({
        type: 'ClusterIP',
        endpoints: 0,
      }),
    ).toBe('unknown')
  })
})

describe('hasSelector', () => {
  it('returns false when selector is missing', () => {
    expect(hasSelector({})).toBe(false)
  })
  it('returns false for an empty selector object', () => {
    expect(hasSelector({ selector: {} })).toBe(false)
  })
  it('returns true when selector has at least one key', () => {
    expect(hasSelector({ selector: { app: 'web' } })).toBe(true)
  })
})

describe('hasInvalidSelector (#6166)', () => {
  it('flags a ClusterIP service with no selector', () => {
    expect(hasInvalidSelector({ type: 'ClusterIP' })).toBe(true)
  })
  it('does not flag ExternalName services without a selector', () => {
    expect(hasInvalidSelector({ type: 'ExternalName' })).toBe(false)
  })
  it('does not flag services with a populated selector', () => {
    expect(
      hasInvalidSelector({
        type: 'ClusterIP',
        selector: { app: 'web' },
      }),
    ).toBe(false)
  })
})

describe('formatServicePort (#6163)', () => {
  it('prefixes the port name when present', () => {
    expect(formatServicePort({ name: 'http', port: 80, protocol: 'TCP' })).toBe(
      'http: 80/TCP',
    )
  })
  it('omits the prefix when no name', () => {
    expect(formatServicePort({ port: 80, protocol: 'TCP' })).toBe('80/TCP')
  })
  it('renders NodePort when set', () => {
    expect(
      formatServicePort({
        name: 'http',
        port: 80,
        protocol: 'TCP',
        nodePort: 30080,
      }),
    ).toBe('http: 80:30080/TCP')
  })
  it('defaults protocol to TCP when omitted', () => {
    expect(formatServicePort({ port: 80 })).toBe('80/TCP')
  })
})

describe('formatServicePorts', () => {
  it('uses structured portDetails when available', () => {
    expect(
      formatServicePorts({
        portDetails: [
          { name: 'http', port: 80, protocol: 'TCP' },
          { name: 'metrics', port: 9090, protocol: 'TCP' },
        ],
      }),
    ).toEqual(['http: 80/TCP', 'metrics: 9090/TCP'])
  })

  it('falls back to flat ports array when portDetails is missing', () => {
    expect(formatServicePorts({ ports: ['80/TCP', '443/TCP'] })).toEqual([
      '80/TCP',
      '443/TCP',
    ])
  })

  it('returns empty array when neither is set', () => {
    expect(formatServicePorts({})).toEqual([])
  })
})
