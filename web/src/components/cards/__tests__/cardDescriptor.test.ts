/**
 * Unit tests for cardDescriptor.ts
 *
 * cardDescriptor is the single source of truth for card registration.
 * Existing dashboard/customizer tests only mock it — this file exercises
 * the real implementations of registerCard, getAllDescriptors,
 * getDescriptorsByCategory, and getDescriptor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ComponentType } from 'react'

// safeLazy invokes React.lazy internally, which requires a React runtime.
// The registerCard tests care only that safeLazy is *called* with the
// descriptor's component loader — the returned component reference is
// stored in the components map but never rendered in this suite.
vi.mock('@/lib/safeLazy', () => ({
  safeLazy: vi.fn((_loader: () => Promise<unknown>, _name?: string) => {
    const marker = { __lazyMarker: true } as unknown as ComponentType<unknown>
    return marker
  }),
}))

import {
  CARD_DESCRIPTORS,
  registerCard,
  getAllDescriptors,
  getDescriptorsByCategory,
  getDescriptor,
  type CardDescriptor,
} from '../cardDescriptor'
import { safeLazy } from '@/lib/safeLazy'
import type { CardComponentProps } from '../cardRegistry'

type RegisterTargets = Parameters<typeof registerCard>[1]

function makeTargets(): RegisterTargets {
  return {
    components: {},
    preloaders: {},
    defaultWidths: {},
    titles: {},
    descriptions: {},
    demoDataCards: new Set<string>(),
    liveDataCards: new Set<string>(),
    demoExemptCards: new Set<string>(),
  }
}

function makeDescriptor(overrides: Partial<CardDescriptor> = {}): CardDescriptor {
  return {
    id: 'test_card',
    title: 'Test Card',
    description: 'A card for tests.',
    category: 'Cluster Health',
    defaultWidth: 6,
    visualization: 'status',
    component: () =>
      Promise.resolve({
        default: (() => null) as unknown as ComponentType<CardComponentProps>,
      }),
    ...overrides,
  }
}

describe('cardDescriptor', () => {
  beforeEach(() => {
    CARD_DESCRIPTORS.clear()
    vi.clearAllMocks()
  })

  describe('registerCard', () => {
    it('stores the descriptor keyed by id in CARD_DESCRIPTORS', () => {
      const targets = makeTargets()
      const descriptor = makeDescriptor({ id: 'alpha' })

      registerCard(descriptor, targets)

      expect(CARD_DESCRIPTORS.has('alpha')).toBe(true)
      expect(CARD_DESCRIPTORS.get('alpha')).toBe(descriptor)
    })

    it('registers a lazy component via safeLazy under the descriptor id', () => {
      const targets = makeTargets()
      const loader = vi.fn(() =>
        Promise.resolve({
          default: (() => null) as unknown as ComponentType<CardComponentProps>,
        }),
      )
      const descriptor = makeDescriptor({ id: 'beta', component: loader })

      registerCard(descriptor, targets)

      expect(safeLazy).toHaveBeenCalledTimes(1)
      expect(safeLazy).toHaveBeenCalledWith(loader, 'default')
      expect(targets.components.beta).toBeDefined()
    })

    it('uses component as preloader when no explicit preloader is provided', () => {
      const targets = makeTargets()
      const loader = vi.fn(() =>
        Promise.resolve({
          default: (() => null) as unknown as ComponentType<CardComponentProps>,
        }),
      )
      const descriptor = makeDescriptor({ id: 'gamma', component: loader })

      registerCard(descriptor, targets)

      expect(targets.preloaders.gamma).toBe(loader)
    })

    it('uses the explicit preloader when provided', () => {
      const targets = makeTargets()
      const preloader = vi.fn(() => Promise.resolve({}))
      const descriptor = makeDescriptor({ id: 'delta', preloader })

      registerCard(descriptor, targets)

      expect(targets.preloaders.delta).toBe(preloader)
      expect(targets.preloaders.delta).not.toBe(descriptor.component)
    })

    it('registers defaultWidth, title, and description under the descriptor id', () => {
      const targets = makeTargets()
      const descriptor = makeDescriptor({
        id: 'epsilon',
        title: 'Epsilon Title',
        description: 'Epsilon description text.',
        defaultWidth: 4,
      })

      registerCard(descriptor, targets)

      expect(targets.defaultWidths.epsilon).toBe(4)
      expect(targets.titles.epsilon).toBe('Epsilon Title')
      expect(targets.descriptions.epsilon).toBe('Epsilon description text.')
    })

    it('adds id to demoDataCards when isDemoOnly is true', () => {
      const targets = makeTargets()
      registerCard(makeDescriptor({ id: 'demo1', isDemoOnly: true }), targets)

      expect(targets.demoDataCards.has('demo1')).toBe(true)
      expect(targets.liveDataCards.has('demo1')).toBe(false)
      expect(targets.demoExemptCards.has('demo1')).toBe(false)
    })

    it('adds id to liveDataCards when isLiveData is true', () => {
      const targets = makeTargets()
      registerCard(makeDescriptor({ id: 'live1', isLiveData: true }), targets)

      expect(targets.liveDataCards.has('live1')).toBe(true)
      expect(targets.demoDataCards.has('live1')).toBe(false)
    })

    it('adds id to demoExemptCards when isDemoExempt is true', () => {
      const targets = makeTargets()
      registerCard(makeDescriptor({ id: 'arcade1', isDemoExempt: true }), targets)

      expect(targets.demoExemptCards.has('arcade1')).toBe(true)
    })

    it('does not add id to any set when all optional flags are omitted', () => {
      const targets = makeTargets()
      registerCard(makeDescriptor({ id: 'plain' }), targets)

      expect(targets.demoDataCards.size).toBe(0)
      expect(targets.liveDataCards.size).toBe(0)
      expect(targets.demoExemptCards.size).toBe(0)
    })

    it('does not add id when a flag is explicitly false', () => {
      const targets = makeTargets()
      registerCard(
        makeDescriptor({
          id: 'flags_false',
          isDemoOnly: false,
          isLiveData: false,
          isDemoExempt: false,
        }),
        targets,
      )

      expect(targets.demoDataCards.size).toBe(0)
      expect(targets.liveDataCards.size).toBe(0)
      expect(targets.demoExemptCards.size).toBe(0)
    })

    it('can register a card that is both live and demo-exempt', () => {
      const targets = makeTargets()
      registerCard(
        makeDescriptor({ id: 'multi', isLiveData: true, isDemoExempt: true }),
        targets,
      )

      expect(targets.liveDataCards.has('multi')).toBe(true)
      expect(targets.demoExemptCards.has('multi')).toBe(true)
      expect(targets.demoDataCards.has('multi')).toBe(false)
    })

    it('overwrites earlier registration when the same id is registered twice', () => {
      const targets = makeTargets()
      registerCard(
        makeDescriptor({ id: 'dup', title: 'First', defaultWidth: 3 }),
        targets,
      )
      registerCard(
        makeDescriptor({ id: 'dup', title: 'Second', defaultWidth: 8 }),
        targets,
      )

      expect(targets.titles.dup).toBe('Second')
      expect(targets.defaultWidths.dup).toBe(8)
      expect(CARD_DESCRIPTORS.get('dup')?.title).toBe('Second')
      expect(CARD_DESCRIPTORS.size).toBe(1)
    })
  })

  describe('getAllDescriptors', () => {
    it('returns an empty array when no descriptors are registered', () => {
      expect(getAllDescriptors()).toEqual([])
    })

    it('returns every registered descriptor', () => {
      const targets = makeTargets()
      const a = makeDescriptor({ id: 'a' })
      const b = makeDescriptor({ id: 'b' })
      const c = makeDescriptor({ id: 'c' })

      registerCard(a, targets)
      registerCard(b, targets)
      registerCard(c, targets)

      const all = getAllDescriptors()
      expect(all).toHaveLength(3)
      expect(all).toEqual(expect.arrayContaining([a, b, c]))
    })

    it('returns a fresh array each call (mutating the result must not affect state)', () => {
      const targets = makeTargets()
      registerCard(makeDescriptor({ id: 'x' }), targets)

      const first = getAllDescriptors()
      first.pop()

      expect(getAllDescriptors()).toHaveLength(1)
    })
  })

  describe('getDescriptorsByCategory', () => {
    it('returns an empty Map when no descriptors are registered', () => {
      const byCategory = getDescriptorsByCategory()
      expect(byCategory.size).toBe(0)
    })

    it('groups descriptors by their category', () => {
      const targets = makeTargets()
      const health1 = makeDescriptor({ id: 'h1', category: 'Cluster Health' })
      const health2 = makeDescriptor({ id: 'h2', category: 'Cluster Health' })
      const storage = makeDescriptor({ id: 's1', category: 'Storage' })

      registerCard(health1, targets)
      registerCard(health2, targets)
      registerCard(storage, targets)

      const byCategory = getDescriptorsByCategory()
      expect(byCategory.size).toBe(2)
      expect(byCategory.get('Cluster Health')).toHaveLength(2)
      expect(byCategory.get('Cluster Health')).toEqual(
        expect.arrayContaining([health1, health2]),
      )
      expect(byCategory.get('Storage')).toEqual([storage])
    })

    it('preserves the insertion order of descriptors within a category', () => {
      const targets = makeTargets()
      const first = makeDescriptor({ id: 'first', category: 'Workloads' })
      const second = makeDescriptor({ id: 'second', category: 'Workloads' })
      const third = makeDescriptor({ id: 'third', category: 'Workloads' })

      registerCard(first, targets)
      registerCard(second, targets)
      registerCard(third, targets)

      expect(getDescriptorsByCategory().get('Workloads')).toEqual([
        first,
        second,
        third,
      ])
    })
  })

  describe('getDescriptor', () => {
    it('returns undefined for an unregistered id', () => {
      expect(getDescriptor('missing')).toBeUndefined()
    })

    it('returns the descriptor for a registered id', () => {
      const targets = makeTargets()
      const descriptor = makeDescriptor({ id: 'lookup_me', title: 'Found' })
      registerCard(descriptor, targets)

      expect(getDescriptor('lookup_me')).toBe(descriptor)
    })

    it('returns the most recently registered descriptor when id is re-registered', () => {
      const targets = makeTargets()
      registerCard(makeDescriptor({ id: 'reg', title: 'Old' }), targets)
      const updated = makeDescriptor({ id: 'reg', title: 'New' })
      registerCard(updated, targets)

      expect(getDescriptor('reg')).toBe(updated)
    })
  })
})
