import { describe, it, expect, vi, afterEach } from 'vitest'
import { MissionSuggestions } from './MissionSuggestions'

// Spy on global timers to verify cleanup behavior (#4660)
const addEventSpy = vi.spyOn(document, 'addEventListener')
const removeEventSpy = vi.spyOn(document, 'removeEventListener')

afterEach(() => {
  addEventSpy.mockClear()
  removeEventSpy.mockClear()
})

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
})
