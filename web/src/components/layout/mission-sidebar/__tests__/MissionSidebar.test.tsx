/**
 * MissionSidebar Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({
    missions: [],
    activeMission: null,
    startMission: vi.fn(),
    isFullScreen: false,
    isSidebarOpen: false,
    toggleSidebar: vi.fn(),
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

/** Timeout for importing heavy modules (markdown/remark) */
const IMPORT_TIMEOUT_MS = 30000

describe('MissionListItem', () => {
  it('exports MissionListItem', async () => {
    const mod = await import('../MissionListItem')
    expect(mod.MissionListItem).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('TypingIndicator', () => {
  it('exports TypingIndicator', async () => {
    const mod = await import('../TypingIndicator')
    expect(mod.TypingIndicator).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('MemoizedMessage', () => {
  it('exports MemoizedMessage', async () => {
    const mod = await import('../MemoizedMessage')
    expect(mod.MemoizedMessage).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('mission-sidebar types', () => {
  it('exports types module', async () => {
    const mod = await import('../types')
    expect(mod).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})
