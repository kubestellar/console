import { describe, it, expect, beforeEach } from 'vitest'
import { recordDashboardVisit, getTopVisitedDashboards } from '../dashboardVisits'

describe('recordDashboardVisit', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('records visits and increments count', () => {
    recordDashboardVisit('/')
    recordDashboardVisit('/')
    recordDashboardVisit('/')

    const top = getTopVisitedDashboards()
    expect(top[0]).toBe('/')
  })

  it('skips auth paths', () => {
    recordDashboardVisit('/auth/callback')
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('skips login path', () => {
    recordDashboardVisit('/login')
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('skips settings path', () => {
    recordDashboardVisit('/settings')
    expect(getTopVisitedDashboards()).toEqual([])
  })
})

describe('getTopVisitedDashboards', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array when no visits', () => {
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('returns dashboards sorted by visit count', () => {
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/pods')
    recordDashboardVisit('/')
    recordDashboardVisit('/')

    const top = getTopVisitedDashboards()
    expect(top[0]).toBe('/clusters')
    expect(top[1]).toBe('/')
    expect(top[2]).toBe('/pods')
  })

  it('limits to N results', () => {
    for (let i = 0; i < 10; i++) {
      recordDashboardVisit(`/dash-${i}`)
    }
    const top = getTopVisitedDashboards(3)
    expect(top.length).toBe(3)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('kubestellar-dashboard-visits', 'not-json')
    expect(getTopVisitedDashboards()).toEqual([])
  })
})
