import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scrollToCard } from '../scrollToCard'

describe('scrollToCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not throw when called', () => {
    expect(() => scrollToCard('test_card')).not.toThrow()
  })

  it('polls for the card element', () => {
    const mockElement = {
      scrollIntoView: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    }
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(mockElement as unknown as Element)

    scrollToCard('test_card')

    // Trigger requestAnimationFrame callback
    vi.advanceTimersByTime(200)

    expect(querySpy).toHaveBeenCalledWith('[data-card-type="test_card"]')

    querySpy.mockRestore()
  })
})
