import { describe, it, expect } from 'vitest'
import * as CloudProviderIconModule from './CloudProviderIcon'

describe('CloudProviderIcon Component', () => {
  it('exports CloudProviderIcon component', () => {
    expect(CloudProviderIconModule.CloudProviderIcon).toBeDefined()
    expect(typeof CloudProviderIconModule.CloudProviderIcon).toBe('function')
  })
})
