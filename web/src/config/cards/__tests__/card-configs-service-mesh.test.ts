/**
 * Service Mesh & Networking Card Config Tests
 *
 * Tests service mesh and advanced networking card configurations.
 */
import { describe, it, expect } from 'vitest'
import { linkerdStatusConfig } from '../linkerd-status'
import { contourStatusConfig } from '../contour-status'
import { envoyStatusConfig } from '../envoy-status'
import { ciliumStatusConfig } from '../cilium-status'
import { cniStatusConfig } from '../cni-status'
import { grpcStatusConfig } from '../grpc-status'
import { spiffeStatusConfig } from '../spiffe-status'
import { spireStatusConfig } from '../spire-status'
import { gatewayStatusConfig } from '../gateway-status'

const serviceMeshCards = [
  { name: 'linkerdStatus', config: linkerdStatusConfig },
  { name: 'contourStatus', config: contourStatusConfig },
  { name: 'envoyStatus', config: envoyStatusConfig },
  { name: 'ciliumStatus', config: ciliumStatusConfig },
  { name: 'cniStatus', config: cniStatusConfig },
  { name: 'grpcStatus', config: grpcStatusConfig },
  { name: 'spiffeStatus', config: spiffeStatusConfig },
  { name: 'spireStatus', config: spireStatusConfig },
  { name: 'gatewayStatus', config: gatewayStatusConfig },
]

describe('Service Mesh & Networking card configs', () => {
  it.each(serviceMeshCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(serviceMeshCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(serviceMeshCards)('$name has icon and iconColor', ({ config }) => {
    expect(config.icon).toBeTruthy()
    if (config.iconColor) {
      expect(typeof config.iconColor).toBe('string')
    }
  })

  it.each(serviceMeshCards)('$name has emptyState', ({ config }) => {
    if (config.emptyState) {
      expect(config.emptyState.title).toBeTruthy()
      expect(config.emptyState.message).toBeTruthy()
    }
  })
})
