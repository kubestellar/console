import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetAnalyticsMock } from './helpers/analytics-events'

vi.mock('../analytics-core', () => ({ send: vi.fn() }))

import { send } from '../analytics-core'
import { emitThemeChanged, emitLanguageChanged } from '../analytics-events/settings'
import { emitDashboardViewed } from '../analytics-events/dashboard'

const mockSend = vi.mocked(send)

beforeEach(() => {
  resetAnalyticsMock(mockSend)
})

describe('analytics events ui', () => {
  it('emits ui preference and dashboard events', () => {
    emitThemeChanged('dark', 'settings')
    emitLanguageChanged('en')
    emitDashboardViewed('main', 250)
    expect(mockSend).toHaveBeenCalledTimes(3)
  })
})
