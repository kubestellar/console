import { vi } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('../analytics-session', () => ({
  getDeploymentType: vi.fn(() => 'localhost'),
}))

import { send, setAnalyticsUserProperties, emitError } from '../analytics-core'
import { isDemoMode } from '../demoMode'
import { getDeploymentType } from '../analytics-session'

export * from '../analytics-events'
export { CAPABILITY_TOOL_EXEC, CAPABILITY_CHAT } from '../analytics-types'

export const analyticsEventMocks = {
  mockSend: vi.mocked(send),
  mockSetProps: vi.mocked(setAnalyticsUserProperties),
  mockEmitError: vi.mocked(emitError),
  mockIsDemoMode: vi.mocked(isDemoMode),
  mockGetDeploymentType: vi.mocked(getDeploymentType),
}

export function resetAnalyticsEventMocks() {
  analyticsEventMocks.mockSend.mockClear()
  analyticsEventMocks.mockSetProps.mockClear()
  analyticsEventMocks.mockEmitError.mockClear()
  analyticsEventMocks.mockIsDemoMode.mockClear()
  analyticsEventMocks.mockGetDeploymentType.mockClear()
  analyticsEventMocks.mockIsDemoMode.mockReturnValue(false)
  analyticsEventMocks.mockGetDeploymentType.mockReturnValue('localhost')
  localStorage.clear()
  sessionStorage.clear()
}
