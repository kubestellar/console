import { describe, it, expect } from 'vitest'
import {
  FILLER_WORDS,
  MIN_WORD_OVERLAP_RATIO,
  HIGH_CONFIDENCE_THRESHOLD,
  toWordSet,
  scoreMission,
  findBestDeepLinkMatch,
} from '../missionBrowserDeepLink'
import type { MissionExport } from '../../../lib/missions/types'

// Mock the getMissionSlug import used by scoreMission
vi.mock('../browser', () => ({
  getMissionSlug: (m: MissionExport) =>
    (m.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
}))

import { vi } from 'vitest'

describe('missionBrowserDeepLink', () => {
  describe('constants', () => {
    it('FILLER_WORDS contains common stopwords', () => {
      expect(FILLER_WORDS.has('and')).toBe(true)
      expect(FILLER_WORDS.has('the')).toBe(true)
      expect(FILLER_WORDS.has('kubernetes')).toBe(true)
      expect(FILLER_WORDS.has('k8s')).toBe(true)
    })

    it('FILLER_WORDS does not include meaningful terms', () => {
      expect(FILLER_WORDS.has('install')).toBe(false)
      expect(FILLER_WORDS.has('deploy')).toBe(false)
      expect(FILLER_WORDS.has('prometheus')).toBe(false)
    })

    it('MIN_WORD_OVERLAP_RATIO is between 0 and 1', () => {
      expect(MIN_WORD_OVERLAP_RATIO).toBeGreaterThan(0)
      expect(MIN_WORD_OVERLAP_RATIO).toBeLessThan(1)
    })

    it('HIGH_CONFIDENCE_THRESHOLD is above MIN_WORD_OVERLAP_RATIO', () => {
      expect(HIGH_CONFIDENCE_THRESHOLD).toBeGreaterThan(MIN_WORD_OVERLAP_RATIO)
    })
  })

  describe('toWordSet', () => {
    it('lowercases and splits on non-alphanumeric', () => {
      const result = toWordSet('Install Open-Policy-Agent')
      expect(result.has('install')).toBe(true)
      expect(result.has('open')).toBe(true)
      expect(result.has('policy')).toBe(true)
      expect(result.has('agent')).toBe(true)
    })

    it('removes filler words', () => {
      const result = toWordSet('Deploy to the Kubernetes cluster')
      expect(result.has('the')).toBe(false)
      expect(result.has('to')).toBe(false)
      expect(result.has('kubernetes')).toBe(false)
      expect(result.has('deploy')).toBe(true)
      expect(result.has('cluster')).toBe(true)
    })

    it('removes single-character tokens', () => {
      const result = toWordSet('a-b-test')
      // 'a' and 'b' are either filler or single-char; 'test' should remain
      expect(result.has('test')).toBe(true)
    })

    it('deduplicates words', () => {
      const result = toWordSet('test test test')
      expect(result.size).toBe(1)
      expect(result.has('test')).toBe(true)
    })

    it('returns empty set for empty string', () => {
      const result = toWordSet('')
      expect(result.size).toBe(0)
    })

    it('handles numeric tokens', () => {
      const result = toWordSet('deploy v2 config')
      expect(result.has('deploy')).toBe(true)
      expect(result.has('v2')).toBe(true)
      expect(result.has('config')).toBe(true)
    })
  })

  describe('scoreMission', () => {
    const makeMission = (title: string, cncfProject?: string): MissionExport =>
      ({ title, cncfProject } as unknown as MissionExport)

    it('returns 1.0 for exact slug match', () => {
      const m = makeMission('install-prometheus')
      const slugWordSet = toWordSet('install-prometheus')
      expect(scoreMission(m, 'install-prometheus', slugWordSet, true)).toBe(1)
    })

    it('returns 0.95 for cncfProject match on installer', () => {
      const m = makeMission('Install and Configure Prometheus', 'prometheus')
      const slugWordSet = toWordSet('install-prometheus')
      expect(scoreMission(m, 'install-prometheus', slugWordSet, true)).toBe(0.95)
    })

    it('does not apply cncfProject shortcut for fixers', () => {
      const m = makeMission('Fix Prometheus Issues', 'prometheus')
      const slugWordSet = toWordSet('install-prometheus')
      const score = scoreMission(m, 'install-prometheus', slugWordSet, false)
      expect(score).not.toBe(0.95)
      expect(score).toBeLessThan(1)
    })

    it('returns fuzzy overlap score for partial word matches', () => {
      const m = makeMission('Deploy Open Policy Agent OPA')
      const slugWordSet = toWordSet('deploy-open-policy-agent')
      const score = scoreMission(m, 'deploy-open-policy-agent', slugWordSet, false)
      // Should have high overlap since title words match slug words
      expect(score).toBeGreaterThan(0.5)
    })

    it('returns 0 when no words overlap', () => {
      const m = makeMission('completely different title')
      const slugWordSet = toWordSet('install-prometheus-monitoring')
      const score = scoreMission(m, 'install-prometheus-monitoring', slugWordSet, false)
      expect(score).toBe(0)
    })

    it('returns 0 when slug word set is empty', () => {
      const m = makeMission('Some Mission')
      const emptySet = new Set<string>()
      expect(scoreMission(m, '', emptySet, false)).toBe(0)
    })
  })

  describe('findBestDeepLinkMatch', () => {
    const makeMission = (title: string, cncfProject?: string): MissionExport =>
      ({ title, cncfProject } as unknown as MissionExport)

    it('returns the best scoring mission above threshold', () => {
      const missions = [
        makeMission('Install Prometheus Monitoring'),
        makeMission('Install Grafana Dashboard'),
        makeMission('Deploy Redis Cache'),
      ]
      const slug = 'install-prometheus-monitoring'
      const slugWordSet = toWordSet(slug)
      const { match, score } = findBestDeepLinkMatch(missions, slug, slugWordSet, true)
      expect(match).toBeDefined()
      expect(match!.title).toBe('Install Prometheus Monitoring')
      expect(score).toBeGreaterThan(MIN_WORD_OVERLAP_RATIO)
    })

    it('returns undefined when no mission exceeds threshold', () => {
      const missions = [
        makeMission('Unrelated Topic'),
        makeMission('Nothing Close'),
      ]
      const slug = 'install-prometheus'
      const slugWordSet = toWordSet(slug)
      const { match } = findBestDeepLinkMatch(missions, slug, slugWordSet, true)
      expect(match).toBeUndefined()
    })

    it('returns highest scoring mission among multiple candidates', () => {
      const missions = [
        makeMission('Install Prometheus'),
        makeMission('Install Prometheus Advanced Monitoring'),
      ]
      const slug = 'install-prometheus'
      const slugWordSet = toWordSet(slug)
      const { match } = findBestDeepLinkMatch(missions, slug, slugWordSet, true)
      expect(match).toBeDefined()
      // Both should match; exact slug match wins
      expect(match!.title).toBe('Install Prometheus')
    })

    it('handles empty mission list', () => {
      const slug = 'install-prometheus'
      const slugWordSet = toWordSet(slug)
      const { match, score } = findBestDeepLinkMatch([], slug, slugWordSet, true)
      expect(match).toBeUndefined()
      expect(score).toBe(MIN_WORD_OVERLAP_RATIO)
    })

    it('prefers cncfProject match for installers', () => {
      const missions = [
        makeMission('Setup and Configure Advanced Monitoring', 'prometheus'),
        makeMission('Install Grafana with Prometheus Sources'),
      ]
      const slug = 'install-prometheus'
      const slugWordSet = toWordSet(slug)
      const { match, score } = findBestDeepLinkMatch(missions, slug, slugWordSet, true)
      expect(match).toBeDefined()
      expect(score).toBe(0.95)
      expect(match!.cncfProject).toBe('prometheus')
    })
  })
})
