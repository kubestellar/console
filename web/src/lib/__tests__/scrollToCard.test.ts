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

  // --- New edge case tests ---

  it('calls scrollIntoView with smooth behavior and center block', () => {
    const mockElement = {
      scrollIntoView: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    }
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(mockElement as unknown as Element)

    scrollToCard('my_card')
    vi.advanceTimersByTime(200)

    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })

    querySpy.mockRestore()
  })

  it('adds highlight ring-3 classes when element is found', () => {
    const mockElement = {
      scrollIntoView: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    }
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(mockElement as unknown as Element)

    scrollToCard('highlight_card')
    vi.advanceTimersByTime(200)

    expect(mockElement.classList.add).toHaveBeenCalledWith(
      'ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-background'
    )

    querySpy.mockRestore()
  })

  it('removes highlight ring-3 classes after 2000ms', () => {
    const SCROLL_HIGHLIGHT_MS = 2000
    const mockElement = {
      scrollIntoView: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    }
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(mockElement as unknown as Element)

    scrollToCard('timed_card')
    // Trigger rAF + first poll
    vi.advanceTimersByTime(200)

    // Highlight should be added but not yet removed
    expect(mockElement.classList.add).toHaveBeenCalled()
    expect(mockElement.classList.remove).not.toHaveBeenCalled()

    // Advance past the highlight duration
    vi.advanceTimersByTime(SCROLL_HIGHLIGHT_MS)

    expect(mockElement.classList.remove).toHaveBeenCalledWith(
      'ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-background'
    )

    querySpy.mockRestore()
  })

  it('continues polling when element is not found immediately', () => {
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(null)

    scrollToCard('missing_card')

    // Trigger rAF + first poll (100ms)
    vi.advanceTimersByTime(200)
    const callCountAfterFirst = querySpy.mock.calls.length

    // Advance another 100ms — should trigger another poll
    vi.advanceTimersByTime(100)
    expect(querySpy.mock.calls.length).toBeGreaterThan(callCountAfterFirst)

    querySpy.mockRestore()
  })

  it('stops polling after 3000ms when element is never found', () => {
    const SCROLL_POLL_MAX_MS = 3000
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(null)

    scrollToCard('nonexistent_card')

    // Advance past the maximum polling duration
    vi.advanceTimersByTime(SCROLL_POLL_MAX_MS + 500)

    const callsAtTimeout = querySpy.mock.calls.length

    // Advance another second — no new polls should happen
    vi.advanceTimersByTime(1000)
    expect(querySpy.mock.calls.length).toBe(callsAtTimeout)

    querySpy.mockRestore()
  })

  it('stops polling as soon as element is found on a later poll', () => {
    const mockElement = {
      scrollIntoView: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    }

    let pollCount = 0
    const POLLS_BEFORE_FOUND = 3
    const querySpy = vi.spyOn(document, 'querySelector').mockImplementation(() => {
      pollCount++
      if (pollCount >= POLLS_BEFORE_FOUND) {
        return mockElement as unknown as Element
      }
      return null
    })

    scrollToCard('delayed_card')

    // Advance enough for the element to be found (rAF + polls)
    vi.advanceTimersByTime(500)

    expect(mockElement.scrollIntoView).toHaveBeenCalled()

    // Record call count and advance more — no new queries should happen
    const callsAtFound = querySpy.mock.calls.length
    vi.advanceTimersByTime(500)
    expect(querySpy.mock.calls.length).toBe(callsAtFound)

    querySpy.mockRestore()
  })

  it('uses the correct data-card-type attribute selector', () => {
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(null)

    scrollToCard('gpu-utilization')
    vi.advanceTimersByTime(200)

    expect(querySpy).toHaveBeenCalledWith('[data-card-type="gpu-utilization"]')

    querySpy.mockRestore()
  })

  it('handles card types with special characters in the selector', () => {
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(null)

    scrollToCard('card_with-dashes_and_underscores')
    vi.advanceTimersByTime(200)

    expect(querySpy).toHaveBeenCalledWith('[data-card-type="card_with-dashes_and_underscores"]')

    querySpy.mockRestore()
  })

  it('can be called multiple times for different cards', () => {
    const mockElement1 = {
      scrollIntoView: vi.fn(),
      classList: { add: vi.fn(), remove: vi.fn() },
    }
    const mockElement2 = {
      scrollIntoView: vi.fn(),
      classList: { add: vi.fn(), remove: vi.fn() },
    }

    const querySpy = vi.spyOn(document, 'querySelector')
      .mockReturnValueOnce(null) // first card's initial rAF call (querySelector during initial frame)
      .mockReturnValueOnce(mockElement1 as unknown as Element)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(mockElement2 as unknown as Element)

    scrollToCard('card_a')
    scrollToCard('card_b')

    vi.advanceTimersByTime(500)

    // Both cards should have been scrolled to
    expect(mockElement1.scrollIntoView).toHaveBeenCalled()
    expect(mockElement2.scrollIntoView).toHaveBeenCalled()

    querySpy.mockRestore()
  })
})
