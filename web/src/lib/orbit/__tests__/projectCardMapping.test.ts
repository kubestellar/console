import { describe, it, expect } from 'vitest'
import { getMonitoringCardsForProject, getMonitoringCardsForProjects } from '../projectCardMapping'

describe('getMonitoringCardsForProject', () => {
  it('returns direct mapping for known CNCF project', () => {
    const result = getMonitoringCardsForProject('prometheus')
    expect(result.hasDirectMapping).toBe(true)
    expect(result.cards).toContain('active_alerts')
    expect(result.cards).toContain('cluster_health') // baseline
  })

  it('returns category fallback for unknown project with known category', () => {
    const result = getMonitoringCardsForProject('unknown-project', 'Security')
    expect(result.hasDirectMapping).toBe(false)
    expect(result.cards).toContain('security_issues')
    expect(result.cards).toContain('cluster_health') // baseline
  })

  it('returns only baseline cards for completely unknown project', () => {
    const result = getMonitoringCardsForProject('totally-unknown', 'Alien Category')
    expect(result.hasDirectMapping).toBe(false)
    expect(result.cards).toEqual(['cluster_health', 'event_stream', 'pod_issues'])
  })

  it('handles undefined inputs gracefully', () => {
    const result = getMonitoringCardsForProject(undefined, undefined)
    expect(result.hasDirectMapping).toBe(false)
    expect(result.cards.length).toBeGreaterThan(0)
  })

  it('normalizes project names to lowercase with hyphens', () => {
    const result = getMonitoringCardsForProject('Argo CD')
    // 'Argo CD' → 'argo-cd' which has a mapping
    expect(result.hasDirectMapping).toBe(true)
    expect(result.cards).toContain('argocd_applications')
  })

  it('deduplicates cards between baseline and project mapping', () => {
    const result = getMonitoringCardsForProject('kubestellar')
    // kubestellar maps to cluster_health (which is also in baseline)
    const uniqueCards = new Set(result.cards)
    expect(result.cards.length).toBe(uniqueCards.size)
  })
})

describe('getMonitoringCardsForProjects', () => {
  it('merges cards across multiple projects', () => {
    const result = getMonitoringCardsForProjects([
      { cncfProject: 'prometheus' },
      { cncfProject: 'argocd' },
    ])
    expect(result.cards).toContain('active_alerts') // from prometheus
    expect(result.cards).toContain('argocd_applications') // from argocd
    expect(result.hasDirectMapping).toBe(true)
  })

  it('sets hasDirectMapping true if any project has a direct mapping', () => {
    const result = getMonitoringCardsForProjects([
      { cncfProject: 'prometheus' },
      { cncfProject: 'unknown', category: 'Security' },
    ])
    expect(result.hasDirectMapping).toBe(true)
  })

  it('handles empty project list', () => {
    const result = getMonitoringCardsForProjects([])
    expect(result.cards).toEqual(['cluster_health', 'event_stream', 'pod_issues'])
  })
})
