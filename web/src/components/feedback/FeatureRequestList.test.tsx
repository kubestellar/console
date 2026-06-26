import { describe, it, expect } from 'vitest'
import * as FeatureRequestListModule from './FeatureRequestList'

describe('FeatureRequestList Component', () => {
  it('exports FeatureRequestList component', () => {
    expect(FeatureRequestListModule.FeatureRequestList).toBeDefined()
    expect(typeof FeatureRequestListModule.FeatureRequestList).toBe('function')
  })
})
