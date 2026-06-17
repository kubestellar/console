import { beforeEach, describe, expect, it } from 'vitest'

import {
  COLLAPSED_BADGE_DEFAULT_COLOR_CLASS,
  getCompactBadgeLabel,
  getNavItemBadge,
  isGroundControlItem,
} from '../SidebarConstants'

describe('SidebarConstants helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('formats large numeric badges for collapsed mode', () => {
    expect(getCompactBadgeLabel('120')).toBe('99+')
    expect(getCompactBadgeLabel('8')).toBe('8')
    expect(getCompactBadgeLabel('beta')).toBe('beta')
  })

  it('uses explicit badge values when provided', () => {
    const badge = getNavItemBadge({
      id: 'alerts',
      label: 'Alerts',
      href: '/alerts',
      icon: 'Bell',
      badge: '7',
    })

    expect(badge.compactLabel).toBe('7')
    expect(badge.tooltipLabel).toBe('7')
    expect(badge.colorClassName).toBe(COLLAPSED_BADGE_DEFAULT_COLOR_CLASS)
    expect(typeof badge.count === 'number' || badge.count === null).toBe(true)
  })

  it('detects Ground Control custom dashboards from stored mappings', () => {
    localStorage.setItem('kc-ground-control-dashboards', JSON.stringify({ ops: { name: 'Ops' } }))

    expect(isGroundControlItem('/custom-dashboard/ops')).toBe(true)
    expect(isGroundControlItem('/custom-dashboard/other')).toBe(false)
  })
})
