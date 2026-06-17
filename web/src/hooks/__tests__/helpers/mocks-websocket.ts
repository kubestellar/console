import { vi } from 'vitest'

export function createMockWebSocket() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1,
  }
}
