/**
 * Tests for useFederation.ts pure utility functions.
 *
 * Covers: getProviderLabel, getStateLabel, getStateColorClasses,
 * and resetFederationCache.
 */

import { describe, it, expect } from 'vitest'
import {
  getProviderLabel,
  getStateLabel,
  getStateColorClasses,
  resetFederationCache,
} from '../useFederation'
import type { FederationProviderName, ClusterState } from '../useFederation'

describe('useFederation pure utilities', () => {
  // ==========================================================================
  // getProviderLabel
  // ==========================================================================

  describe('getProviderLabel', () => {
    it('returns OCM for ocm', () => {
      expect(getProviderLabel('ocm')).toBe('OCM')
    })

    it('returns Karmada for karmada', () => {
      expect(getProviderLabel('karmada')).toBe('Karmada')
    })

    it('returns Clusternet for clusternet', () => {
      expect(getProviderLabel('clusternet')).toBe('Clusternet')
    })

    it('returns Liqo for liqo', () => {
      expect(getProviderLabel('liqo')).toBe('Liqo')
    })

    it('returns KubeAdmiral for kubeadmiral', () => {
      expect(getProviderLabel('kubeadmiral')).toBe('KubeAdmiral')
    })

    it('returns CAPI for capi', () => {
      expect(getProviderLabel('capi')).toBe('CAPI')
    })

    it('returns the raw string for unknown providers', () => {
      expect(getProviderLabel('custom-provider' as FederationProviderName)).toBe('custom-provider')
    })
  })

  // ==========================================================================
  // getStateLabel
  // ==========================================================================

  describe('getStateLabel', () => {
    const expectedLabels: Record<ClusterState, string> = {
      joined: 'Joined',
      pending: 'Pending',
      unknown: 'Unknown',
      'not-member': 'Not Member',
      provisioning: 'Provisioning',
      provisioned: 'Provisioned',
      failed: 'Failed',
      deleting: 'Deleting',
    }

    for (const [state, label] of Object.entries(expectedLabels)) {
      it(`returns "${label}" for "${state}"`, () => {
        expect(getStateLabel(state as ClusterState)).toBe(label)
      })
    }

    it('returns the raw string for unknown states', () => {
      expect(getStateLabel('new-state' as ClusterState)).toBe('new-state')
    })
  })

  // ==========================================================================
  // getStateColorClasses
  // ==========================================================================

  describe('getStateColorClasses', () => {
    it('returns green classes for joined', () => {
      const classes = getStateColorClasses('joined')
      expect(classes).toContain('text-green-400')
      expect(classes).toContain('bg-green-500/15')
    })

    it('returns yellow classes for pending', () => {
      const classes = getStateColorClasses('pending')
      expect(classes).toContain('text-yellow-400')
    })

    it('returns blue classes for provisioning', () => {
      const classes = getStateColorClasses('provisioning')
      expect(classes).toContain('text-blue-400')
    })

    it('returns green classes for provisioned', () => {
      const classes = getStateColorClasses('provisioned')
      expect(classes).toContain('text-green-400')
    })

    it('returns red classes for failed', () => {
      const classes = getStateColorClasses('failed')
      expect(classes).toContain('text-red-400')
    })

    it('returns orange classes for deleting', () => {
      const classes = getStateColorClasses('deleting')
      expect(classes).toContain('text-orange-400')
    })

    it('returns muted classes for unknown', () => {
      const classes = getStateColorClasses('unknown')
      expect(classes).toContain('text-muted-foreground')
    })

    it('returns muted classes for not-member', () => {
      const classes = getStateColorClasses('not-member')
      expect(classes).toContain('text-muted-foreground')
    })

    it('falls back to unknown colors for unrecognized state', () => {
      const classes = getStateColorClasses('brand-new-state' as ClusterState)
      expect(classes).toContain('text-muted-foreground')
    })
  })

  // ==========================================================================
  // resetFederationCache
  // ==========================================================================

  describe('resetFederationCache', () => {
    it('does not throw when called', () => {
      expect(() => resetFederationCache()).not.toThrow()
    })

    it('can be called multiple times without error', () => {
      expect(() => {
        resetFederationCache()
        resetFederationCache()
      }).not.toThrow()
    })
  })
})
