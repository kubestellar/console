import { vi } from 'vitest'

export function resetAnalyticsMock(mockSend: ReturnType<typeof vi.fn>) {
  mockSend.mockClear()
}
