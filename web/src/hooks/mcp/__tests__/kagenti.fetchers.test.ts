import { describe, it, expect } from 'vitest'
import * as mod from '../kagenti'

describe('kagenti fetchers', () => {
  it('keeps kagenti fetcher-backed hooks exported', () => {
    expect(mod).toHaveProperty('useKagentiAgents')
    expect(mod).toHaveProperty('useKagentiBuilds')
    expect(mod).toHaveProperty('useKagentiCards')
    expect(mod).toHaveProperty('useKagentiTools')
  })
})
