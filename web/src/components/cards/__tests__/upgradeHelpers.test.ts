import { describe, it, expect } from 'vitest'
import { isValidElement } from 'react'
import { ArrowUp, CheckCircle, AlertTriangle, WifiOff, Loader2 } from 'lucide-react'
import {
  SORT_OPTIONS,
  STATUS_ORDER,
  UPGRADE_SORT_COMPARATORS,
  DEMO_VERSIONS,
  FALLBACK_LATEST_MINOR,
  deriveLatestMinor,
  getRecommendedUpgrade,
  getStatusIcon,
  getDemoVersionForCluster,
  buildUpgradePrompt,
  type UpgradeItem,
  type SortByOption,
} from '../upgradeHelpers'

function makeItem(overrides: Partial<UpgradeItem> = {}): UpgradeItem {
  return {
    name: 'cluster-a',
    currentVersion: 'v1.30.0',
    targetVersion: 'v1.31.0',
    status: 'available',
    progress: 0,
    isUnreachable: false,
    isLoading: false,
    ...overrides,
  }
}

describe('upgradeHelpers constants', () => {
  it('SORT_OPTIONS exposes status, version, cluster in order', () => {
    expect(SORT_OPTIONS.map((o) => o.value)).toEqual(['status', 'version', 'cluster'])
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual(['Status', 'Version', 'Cluster'])
  })

  it('STATUS_ORDER prioritises available < loading < unreachable < current', () => {
    expect(STATUS_ORDER.available).toBe(0)
    expect(STATUS_ORDER.loading).toBe(1)
    expect(STATUS_ORDER.unreachable).toBe(2)
    expect(STATUS_ORDER.current).toBe(3)
  })

  it('DEMO_VERSIONS provides a version for each known provider keyword', () => {
    for (const key of ['eks', 'aks', 'gke', 'openshift', 'oci', 'kind', 'k3s', 'minikube', 'rancher']) {
      expect(DEMO_VERSIONS[key]).toMatch(/^v\d+\.\d+\.\d+$/)
    }
  })

  it('FALLBACK_LATEST_MINOR is a positive integer', () => {
    expect(Number.isInteger(FALLBACK_LATEST_MINOR)).toBe(true)
    expect(FALLBACK_LATEST_MINOR).toBeGreaterThan(0)
  })
})

describe('UPGRADE_SORT_COMPARATORS', () => {
  it('status comparator orders by STATUS_ORDER (available before current)', () => {
    const available = makeItem({ status: 'available' })
    const current = makeItem({ status: 'current' })
    expect(UPGRADE_SORT_COMPARATORS.status(available, current)).toBeLessThan(0)
    expect(UPGRADE_SORT_COMPARATORS.status(current, available)).toBeGreaterThan(0)
  })

  it('status comparator returns 0 for equal statuses', () => {
    const a = makeItem({ status: 'loading' })
    const b = makeItem({ status: 'loading' })
    expect(UPGRADE_SORT_COMPARATORS.status(a, b)).toBe(0)
  })

  it('version comparator sorts by currentVersion alphabetically (localeCompare)', () => {
    const older = makeItem({ currentVersion: 'v1.28.0' })
    const newer = makeItem({ currentVersion: 'v1.31.0' })
    expect(UPGRADE_SORT_COMPARATORS.version(older, newer)).toBeLessThan(0)
    expect(UPGRADE_SORT_COMPARATORS.version(newer, older)).toBeGreaterThan(0)
  })

  it('cluster comparator sorts by name', () => {
    const a = makeItem({ name: 'alpha' })
    const b = makeItem({ name: 'bravo' })
    expect(UPGRADE_SORT_COMPARATORS.cluster(a, b)).toBeLessThan(0)
    expect(UPGRADE_SORT_COMPARATORS.cluster(b, a)).toBeGreaterThan(0)
    expect(UPGRADE_SORT_COMPARATORS.cluster(a, a)).toBe(0)
  })

  it('exposes a comparator for every SortByOption', () => {
    for (const { value } of SORT_OPTIONS) {
      const cmp = UPGRADE_SORT_COMPARATORS[value as SortByOption]
      expect(typeof cmp).toBe('function')
    }
  })
})

describe('deriveLatestMinor', () => {
  it('returns FALLBACK_LATEST_MINOR when versions map is empty', () => {
    expect(deriveLatestMinor({})).toBe(FALLBACK_LATEST_MINOR)
  })

  it('returns FALLBACK_LATEST_MINOR when no version string is parseable', () => {
    expect(deriveLatestMinor({ a: 'not-a-version', b: 'loading...', c: '-' })).toBe(FALLBACK_LATEST_MINOR)
  })

  it('returns highest observed minor plus one', () => {
    expect(deriveLatestMinor({ a: 'v1.28.5', b: 'v1.31.2', c: 'v1.30.0' })).toBe(32)
  })

  it('accepts version strings without a leading v prefix', () => {
    expect(deriveLatestMinor({ a: '1.29.0' })).toBe(30)
  })

  it('ignores unparseable entries and uses the highest parseable minor', () => {
    expect(deriveLatestMinor({ a: 'v1.27.0', b: 'garbage', c: 'v1.32.4' })).toBe(33)
  })

  it('handles a single-entry map', () => {
    expect(deriveLatestMinor({ only: 'v1.30.0' })).toBe(31)
  })
})

describe('getRecommendedUpgrade', () => {
  const LATEST = 33

  it('returns null for empty currentVersion', () => {
    expect(getRecommendedUpgrade('', LATEST)).toBeNull()
  })

  it('returns null for placeholder "-"', () => {
    expect(getRecommendedUpgrade('-', LATEST)).toBeNull()
  })

  it('returns null for placeholder "loading..."', () => {
    expect(getRecommendedUpgrade('loading...', LATEST)).toBeNull()
  })

  it('returns null for unparseable version strings', () => {
    expect(getRecommendedUpgrade('not-a-version', LATEST)).toBeNull()
  })

  it('suggests next minor when more than two minors behind', () => {
    // 30 < 33 - 2 -> false; 29 < 31 -> true
    expect(getRecommendedUpgrade('v1.29.5', LATEST)).toBe('v1.30.0')
  })

  it('suggests next patch when behind on minor and patch < 10', () => {
    // minor 32 < 33, patch 4 < 10
    expect(getRecommendedUpgrade('v1.32.4', LATEST)).toBe('v1.32.5')
  })

  it('returns null when up to date (minor equals latestMinor)', () => {
    expect(getRecommendedUpgrade('v1.33.0', LATEST)).toBeNull()
  })

  it('returns null when patch is already >= 10 and only one minor behind', () => {
    // minor 32 < 33 but patch 10 not < 10 -> null
    expect(getRecommendedUpgrade('v1.32.10', LATEST)).toBeNull()
  })

  it('accepts version strings without a leading v prefix', () => {
    expect(getRecommendedUpgrade('1.29.5', LATEST)).toBe('v1.30.0')
  })

  it('handles a cluster more than two minors behind with high patch', () => {
    // "next minor" branch dominates the patch check
    expect(getRecommendedUpgrade('v1.28.99', LATEST)).toBe('v1.29.0')
  })
})

describe('getStatusIcon', () => {
  it('returns a CheckCircle element for "current"', () => {
    const el = getStatusIcon('current')
    expect(isValidElement(el)).toBe(true)
    expect((el as { type: unknown }).type).toBe(CheckCircle)
  })

  it('returns an ArrowUp element for "available"', () => {
    const el = getStatusIcon('available')
    expect((el as { type: unknown }).type).toBe(ArrowUp)
  })

  it('returns an AlertTriangle element for "failed"', () => {
    const el = getStatusIcon('failed')
    expect((el as { type: unknown }).type).toBe(AlertTriangle)
  })

  it('returns a WifiOff element for "unreachable"', () => {
    const el = getStatusIcon('unreachable')
    expect((el as { type: unknown }).type).toBe(WifiOff)
  })

  it('returns a spinning Loader2 element for "loading"', () => {
    const el = getStatusIcon('loading')
    expect((el as { type: unknown }).type).toBe(Loader2)
    const props = (el as { props: { className: string } }).props
    expect(props.className).toContain('animate-spin')
  })

  it('returns null for unknown status strings', () => {
    expect(getStatusIcon('unknown-status')).toBeNull()
    expect(getStatusIcon('')).toBeNull()
  })
})

describe('getDemoVersionForCluster', () => {
  it('matches known provider keywords case-insensitively', () => {
    expect(getDemoVersionForCluster('my-EKS-cluster')).toBe(DEMO_VERSIONS.eks)
    expect(getDemoVersionForCluster('prod-AKS')).toBe(DEMO_VERSIONS.aks)
    expect(getDemoVersionForCluster('OpenShift-1')).toBe(DEMO_VERSIONS.openshift)
  })

  it('matches when keyword appears as a substring anywhere in name', () => {
    expect(getDemoVersionForCluster('team-gke-west')).toBe(DEMO_VERSIONS.gke)
    expect(getDemoVersionForCluster('local-kind-dev')).toBe(DEMO_VERSIONS.kind)
    expect(getDemoVersionForCluster('rancher-east')).toBe(DEMO_VERSIONS.rancher)
  })

  it('falls back to a deterministic version keyed by name length when no keyword matches', () => {
    const fallbackPool = ['v1.30.2', 'v1.31.1', 'v1.29.8', 'v1.32.0', 'v1.30.5']
    const name = 'foo' // length 3 -> index 3
    expect(getDemoVersionForCluster(name)).toBe(fallbackPool[name.length % fallbackPool.length])
  })

  it('is deterministic — same input yields same output', () => {
    expect(getDemoVersionForCluster('alpha')).toBe(getDemoVersionForCluster('alpha'))
    expect(getDemoVersionForCluster('some-name')).toBe(getDemoVersionForCluster('some-name'))
  })
})

describe('buildUpgradePrompt', () => {
  it('includes cluster name and both versions', () => {
    const prompt = buildUpgradePrompt('prod-eks', 'v1.29.5', 'v1.30.0')
    expect(prompt).toContain('"prod-eks"')
    expect(prompt).toContain('v1.29.5')
    expect(prompt).toContain('v1.30.0')
  })

  it('enumerates the five upgrade steps', () => {
    const prompt = buildUpgradePrompt('c', 'v1', 'v2')
    expect(prompt).toContain('1. First checking')
    expect(prompt).toContain('2. Reviewing the upgrade path')
    expect(prompt).toContain('3. Creating a backup/rollback plan')
    expect(prompt).toContain('4. Performing the upgrade')
    expect(prompt).toContain('5. Validating')
  })

  it('asks for confirmation before making changes', () => {
    const prompt = buildUpgradePrompt('c', 'v1', 'v2')
    expect(prompt.toLowerCase()).toContain('confirmation')
  })
})
