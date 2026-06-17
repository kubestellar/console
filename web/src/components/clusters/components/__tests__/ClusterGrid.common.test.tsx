/**
 * ClusterGrid.common Utility Tests
 *
 * Tests for the shared utility functions exported from ClusterGrid.common.tsx.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

import { handleCardKeyDown } from '../ClusterGrid.common'

describe('handleCardKeyDown', () => {
  it('calls the callback when Enter key is pressed', () => {
    const callback = vi.fn()
    const handler = handleCardKeyDown(callback)
    const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    handler(event)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('calls the callback when Space key is pressed', () => {
    const callback = vi.fn()
    const handler = handleCardKeyDown(callback)
    const event = { key: ' ', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    handler(event)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('does not call the callback for other keys', () => {
    const callback = vi.fn()
    const handler = handleCardKeyDown(callback)
    for (const key of ['Tab', 'Escape', 'ArrowDown', 'a', 'F1']) {
      const event = { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent
      handler(event)
      expect(callback).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
  })

  it('returns a new handler function for each invocation', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const h1 = handleCardKeyDown(cb1)
    const h2 = handleCardKeyDown(cb2)
    expect(h1).not.toBe(h2)
  })
})
