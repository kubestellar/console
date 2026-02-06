import { describe, it, expect } from 'vitest'
import * as FeatureRequestModalModule from './FeatureRequestModal'

describe('FeatureRequestModal Component', () => {
  it('exports FeatureRequestModal component', () => {
    expect(FeatureRequestModalModule.FeatureRequestModal).toBeDefined()
    expect(typeof FeatureRequestModalModule.FeatureRequestModal).toBe('function')
  })
})
