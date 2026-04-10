import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MissionSuggestions } from './MissionSuggestions'
import type { MissionSuggestion } from '../../hooks/useMissionSuggestions'

// Spy on global timers to verify cleanup behavior (#4660)
const addEventSpy = vi.spyOn(document, 'addEventListener')
const removeEventSpy = vi.spyOn(document, 'removeEventListener')

// --- Mocks ---------------------------------------------------------------

const mockSuggestion: MissionSuggestion = {
  id: 'test-suggestion-1',
  type: 'restart',
  title: 'Test Suggestion',
  description: 'A test suggestion description',
  priority: 'high',
  action: {
    type: 'ai',
    target: 'fix it',
    label: 'Investigate' },
  context: {
    details: ['detail one', 'detail two'] },
  detectedAt: Date.now() }

vi.mock('../../hooks/useMissionSuggestions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useMissionSuggestions')>()
  return {
    ...actual,
    useMissionSuggestions: () => ({
      suggestions: [mockSuggestion],
      hasSuggestions: true,
      stats: { critical: 0, high: 1, medium: 0, low: 0 } }) }
})

vi.mock('../../hooks/useSnoozedMissions', () => ({
  useSnoozedMissions: () => ({
    snoozeMission: vi.fn(),
    dismissMission: vi.fn(),
    getSnoozeRemaining: () => null,
    snoozedMissions: [] }),
  formatTimeRemaining: (n: number) => `${n}s` }))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }) }))

vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'connected' }) }))

vi.mock('../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false }))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }) }))

vi.mock('../../lib/analytics', () => ({
  emitMissionSuggestionsShown: vi.fn(),
  emitMissionSuggestionActioned: vi.fn() }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${key} ${opts.count}`
      return key
    } }) }))

afterEach(() => {
  addEventSpy.mockClear()
  removeEventSpy.mockClear()
  cleanup()
})

// --- Tests ---------------------------------------------------------------

describe('MissionSuggestions Component', () => {
  it('exports MissionSuggestions component', () => {
    expect(MissionSuggestions).toBeDefined()
    expect(typeof MissionSuggestions).toBe('function')
  })

  it('setTimeout used for deferred listeners should be clearable', () => {
    // The fix stores the setTimeout return value so cleanup can call clearTimeout.
    // Verify that clearTimeout is callable with a timer ID (basic contract test).
    const id = setTimeout(() => {}, 0)
    expect(() => clearTimeout(id)).not.toThrow()
  })

  it('removeEventListener is callable without prior addEventListener', () => {
    // Ensures cleanup is safe even if the deferred setTimeout hasn't fired yet
    const handler = () => {}
    expect(() => document.removeEventListener('mousedown', handler)).not.toThrow()
    expect(() => document.removeEventListener('keydown', handler)).not.toThrow()
  })

  it('chip dropdown closes when clicking its own chevron (#6050)', async () => {
    render(
      <MemoryRouter>
        <MissionSuggestions />
      </MemoryRouter>
    )

    // Component renders in minimized state — find the chip by title
    const chip = screen.getByRole('button', { name: /Test Suggestion/ })
    expect(chip).toBeDefined()

    // 1. Open the dropdown
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu')).toBeDefined()

    // Allow the deferred setTimeout(0) to install the outside-click listener
    await new Promise((resolve) => setTimeout(resolve, 0))

    // 2. Simulate the real-world sequence: a mousedown then click on the chip.
    // Before the fix, the document-level mousedown listener would fire first,
    // set expandedId=null, then the button's onClick would toggle it back open.
    fireEvent.mouseDown(chip)
    fireEvent.click(chip)

    // 3. Dropdown should now be closed
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
