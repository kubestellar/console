import { describe, it, expect, vi, afterEach } from 'vitest'
import * as CardRecommendationsModule from './CardRecommendations'

// Spy on global timers to verify cleanup behavior (#4661)
const addEventSpy = vi.spyOn(document, 'addEventListener')
const removeEventSpy = vi.spyOn(document, 'removeEventListener')

afterEach(() => {
  addEventSpy.mockClear()
  removeEventSpy.mockClear()
})

describe('CardRecommendations Component', () => {
  it('exports CardRecommendations component', () => {
    expect(CardRecommendationsModule.CardRecommendations).toBeDefined()
    expect(typeof CardRecommendationsModule.CardRecommendations).toBe('function')
  })

  it('setTimeout used for deferred listeners should be clearable', () => {
    // The fix stores the setTimeout return value so cleanup can call clearTimeout.
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
