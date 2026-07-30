import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all registry sub-modules
vi.mock('../cards', () => ({
  registerCard: vi.fn(),
  getCardDefinition: vi.fn(),
  getAllCardDefinitions: vi.fn(() => []),
  registerDataHook: vi.fn(),
  registerDrillAction: vi.fn(),
  registerRenderer: vi.fn(),
}))

vi.mock('../dashboards/DashboardRuntime', () => ({
  registerDashboard: vi.fn(),
  getDashboardDefinition: vi.fn(),
  getAllDashboardDefinitions: vi.fn(() => []),
  registerStatsValueGetter: vi.fn(),
}))

vi.mock('../modals', () => ({
  registerModal: vi.fn(),
  getModalDefinition: vi.fn(),
  getAllModalDefinitions: vi.fn(() => []),
  registerSectionRenderer: vi.fn(),
}))

vi.mock('../stats', () => ({
  registerStats: vi.fn(),
  getStatsDefinition: vi.fn(),
  getAllStatsDefinitions: vi.fn(() => []),
  registerStatValueGetter: vi.fn(),
}))

import {
  registry,
  registerCards,
  registerDashboards,
  registerModals,
  registerAllStats,
  getRegistryCounts,
  listRegistered,
} from '../registry'

import { registerCard, getCardDefinition, getAllCardDefinitions, registerDataHook, registerDrillAction, registerRenderer } from '../cards'
import { registerDashboard, getDashboardDefinition, getAllDashboardDefinitions } from '../dashboards/DashboardRuntime'
import { registerModal, getModalDefinition, getAllModalDefinitions, registerSectionRenderer } from '../modals'
import { registerStats, getStatsDefinition, getAllStatsDefinitions, registerStatValueGetter } from '../stats'

describe('registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cards', () => {
    it('exposes register function', () => {
      expect(registry.cards.register).toBe(registerCard)
    })

    it('exposes get function', () => {
      expect(registry.cards.get).toBe(getCardDefinition)
    })

    it('exposes getAll function', () => {
      expect(registry.cards.getAll).toBe(getAllCardDefinitions)
    })

    it('has method delegates to getCardDefinition', () => {
      vi.mocked(getCardDefinition).mockReturnValueOnce({ type: 'test' } as never)
      expect(registry.cards.has('test')).toBe(true)

      vi.mocked(getCardDefinition).mockReturnValueOnce(undefined)
      expect(registry.cards.has('missing')).toBe(false)
    })

    it('exposes registerDataHook', () => {
      expect(registry.cards.registerDataHook).toBe(registerDataHook)
    })

    it('exposes registerDrillAction', () => {
      expect(registry.cards.registerDrillAction).toBe(registerDrillAction)
    })

    it('exposes registerRenderer', () => {
      expect(registry.cards.registerRenderer).toBe(registerRenderer)
    })
  })

  describe('dashboards', () => {
    it('exposes register function', () => {
      expect(registry.dashboards.register).toBe(registerDashboard)
    })

    it('exposes get function', () => {
      expect(registry.dashboards.get).toBe(getDashboardDefinition)
    })

    it('exposes getAll function', () => {
      expect(registry.dashboards.getAll).toBe(getAllDashboardDefinitions)
    })

    it('has method delegates to getDashboardDefinition', () => {
      vi.mocked(getDashboardDefinition).mockReturnValueOnce({ id: 'test' } as never)
      expect(registry.dashboards.has('test')).toBe(true)

      vi.mocked(getDashboardDefinition).mockReturnValueOnce(undefined)
      expect(registry.dashboards.has('missing')).toBe(false)
    })
  })

  describe('modals', () => {
    it('exposes register function', () => {
      expect(registry.modals.register).toBe(registerModal)
    })

    it('exposes get function', () => {
      expect(registry.modals.get).toBe(getModalDefinition)
    })

    it('exposes getAll function', () => {
      expect(registry.modals.getAll).toBe(getAllModalDefinitions)
    })

    it('has method delegates to getModalDefinition', () => {
      vi.mocked(getModalDefinition).mockReturnValueOnce({ kind: 'Pod' } as never)
      expect(registry.modals.has('Pod')).toBe(true)

      vi.mocked(getModalDefinition).mockReturnValueOnce(undefined)
      expect(registry.modals.has('missing')).toBe(false)
    })

    it('exposes registerSectionRenderer', () => {
      expect(registry.modals.registerSectionRenderer).toBe(registerSectionRenderer)
    })
  })

  describe('stats', () => {
    it('exposes register function', () => {
      expect(registry.stats.register).toBe(registerStats)
    })

    it('exposes get function', () => {
      expect(registry.stats.get).toBe(getStatsDefinition)
    })

    it('exposes getAll function', () => {
      expect(registry.stats.getAll).toBe(getAllStatsDefinitions)
    })

    it('has method delegates to getStatsDefinition', () => {
      vi.mocked(getStatsDefinition).mockReturnValueOnce({ type: 'test' } as never)
      expect(registry.stats.has('test')).toBe(true)

      vi.mocked(getStatsDefinition).mockReturnValueOnce(undefined)
      expect(registry.stats.has('missing')).toBe(false)
    })

    it('exposes registerValueGetter', () => {
      expect(registry.stats.registerValueGetter).toBe(registerStatValueGetter)
    })
  })
})

describe('registerCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls registerCard for each definition', () => {
    const defs = [{ type: 'a' }, { type: 'b' }] as never[]
    registerCards(defs)
    expect(registerCard).toHaveBeenCalledTimes(2)
    // forEach passes (element, index, array) so check the first argument of each call
    expect(vi.mocked(registerCard).mock.calls[0][0]).toBe(defs[0])
    expect(vi.mocked(registerCard).mock.calls[1][0]).toBe(defs[1])
  })

  it('handles empty array', () => {
    registerCards([])
    expect(registerCard).not.toHaveBeenCalled()
  })
})

describe('registerDashboards', () => {
  it('calls registerDashboard for each definition', () => {
    const defs = [{ id: 'a' }, { id: 'b' }] as never[]
    registerDashboards(defs)
    expect(registerDashboard).toHaveBeenCalledTimes(2)
  })
})

describe('registerModals', () => {
  it('calls registerModal for each definition', () => {
    const defs = [{ kind: 'Pod' }] as never[]
    registerModals(defs)
    expect(registerModal).toHaveBeenCalledTimes(1)
  })
})

describe('registerAllStats', () => {
  it('calls registerStats for each definition', () => {
    const defs = [{ type: 'a' }, { type: 'b' }, { type: 'c' }] as never[]
    registerAllStats(defs)
    expect(registerStats).toHaveBeenCalledTimes(3)
  })
})

describe('getRegistryCounts', () => {
  it('returns counts from all registries', () => {
    vi.mocked(getAllCardDefinitions).mockReturnValueOnce([{ type: 'a' }, { type: 'b' }] as never[])
    vi.mocked(getAllDashboardDefinitions).mockReturnValueOnce([{ id: 'x' }] as never[])
    vi.mocked(getAllModalDefinitions).mockReturnValueOnce([{ kind: 'Pod' }, { kind: 'Node' }, { kind: 'Service' }] as never[])
    vi.mocked(getAllStatsDefinitions).mockReturnValueOnce([] as never[])

    const counts = getRegistryCounts()
    expect(counts.cards).toBe(2)
    expect(counts.dashboards).toBe(1)
    expect(counts.modals).toBe(3)
    expect(counts.stats).toBe(0)
    expect(counts.total).toBe(6)
  })

  it('returns zero for all when registries are empty', () => {
    const counts = getRegistryCounts()
    expect(counts.total).toBe(0)
  })
})

describe('listRegistered', () => {
  it('returns IDs from all registries', () => {
    vi.mocked(getAllCardDefinitions).mockReturnValueOnce([{ type: 'card-a' }, { type: 'card-b' }] as never[])
    vi.mocked(getAllDashboardDefinitions).mockReturnValueOnce([{ id: 'dash-1' }] as never[])
    vi.mocked(getAllModalDefinitions).mockReturnValueOnce([{ kind: 'Pod' }] as never[])
    vi.mocked(getAllStatsDefinitions).mockReturnValueOnce([{ type: 'stat-x' }] as never[])

    const listed = listRegistered()
    expect(listed.cards).toEqual(['card-a', 'card-b'])
    expect(listed.dashboards).toEqual(['dash-1'])
    expect(listed.modals).toEqual(['Pod'])
    expect(listed.stats).toEqual(['stat-x'])
  })

  it('returns empty arrays when nothing is registered', () => {
    const listed = listRegistered()
    expect(listed.cards).toEqual([])
    expect(listed.dashboards).toEqual([])
    expect(listed.modals).toEqual([])
    expect(listed.stats).toEqual([])
  })
})
