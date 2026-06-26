import { describe, it, expect } from 'vitest'
import * as NotificationBadgeModule from './NotificationBadge'

describe('NotificationBadge Component', () => {
  it('exports NotificationBadge component', () => {
    expect(NotificationBadgeModule.NotificationBadge).toBeDefined()
    expect(typeof NotificationBadgeModule.NotificationBadge).toBe('function')
  })
})
