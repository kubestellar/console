import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/stats/types', () => ({
  COLOR_CLASSES: {},
}))

vi.mock('./statBlockFactoryModal.utils', () => ({
  DEMO_STAT_VALUE: 42,
  getIcon: () => () => null,
}))

import { StatsPreview } from './StatBlockFactoryPreview'

describe('StatsPreview Component', () => {
  it('exports StatsPreview component', () => {
    expect(StatsPreview).toBeDefined()
    expect(typeof StatsPreview).toBe('function')
  })

  it('renders with empty blocks', () => {
    expect(() => {
      StatsPreview({ title: 'Test Stats', blocks: [] })
    }).not.toThrow()
  })

  it('renders with blocks', () => {
    const blocks = [
      { id: '1', label: 'CPU', icon: 'cpu', color: 'blue', field: 'cpu' },
    ]
    expect(() => {
      StatsPreview({ title: 'Test Stats', blocks })
    }).not.toThrow()
  })
})
