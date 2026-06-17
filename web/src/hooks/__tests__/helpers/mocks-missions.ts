import { vi } from 'vitest'

export const mockMissionApi = {
  startMission: vi.fn(),
  sendMessage: vi.fn(),
  cancelMission: vi.fn(),
}
