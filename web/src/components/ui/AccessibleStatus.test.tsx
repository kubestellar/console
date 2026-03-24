import { describe, it, expect } from 'vitest'
import { AccessibleStatusBadge, AccessibleStatusText } from './AccessibleStatus'
import { STATUS_TOOLTIPS } from '../shared/TechnicalAcronym'

describe('AccessibleStatus Component', () => {
  it('exports AccessibleStatusBadge component', () => {
    expect(AccessibleStatusBadge).toBeDefined()
    expect(typeof AccessibleStatusBadge).toBe('function')
  })

  it('exports AccessibleStatusText component', () => {
    expect(AccessibleStatusText).toBeDefined()
    expect(typeof AccessibleStatusText).toBe('function')
  })

  it('STATUS_TOOLTIPS provides descriptive tooltip text for common statuses', () => {
    expect(STATUS_TOOLTIPS['healthy']).toBeDefined()
    expect(STATUS_TOOLTIPS['error']).toBeDefined()
    expect(STATUS_TOOLTIPS['warning']).toBeDefined()
    expect(STATUS_TOOLTIPS['critical']).toBeDefined()
    expect(STATUS_TOOLTIPS['pending']).toBeDefined()
  })
})
