import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetAnalyticsMock } from './helpers/analytics-events'

vi.mock('../analytics-core', () => ({ send: vi.fn() }))

import { send } from '../analytics-core'
import { emitLogin, emitLogout, emitSessionExpired, emitGitHubConnected } from '../analytics-events/auth'

const mockSend = vi.mocked(send)

beforeEach(() => {
  resetAnalyticsMock(mockSend)
})

describe('analytics events auth', () => {
  it('emits login/logout/session events', () => {
    emitLogin('github')
    emitLogout()
    emitSessionExpired()
    emitGitHubConnected()
    expect(mockSend).toHaveBeenCalled()
  })
})
