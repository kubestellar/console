import { vi } from 'vitest'

export const mockDrillDownActions = {
  open: vi.fn(),
  close: vi.fn(),
  push: vi.fn(),
  pop: vi.fn(),
}
