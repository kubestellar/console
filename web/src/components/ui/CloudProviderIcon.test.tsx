import { describe, it, expect } from 'vitest'
import { CloudProviderIcon } from './CloudProviderIcon'

describe('CloudProviderIcon Component', () => {
  it('exports CloudProviderIcon component', () => {
    expect(CloudProviderIcon).toBeDefined()
    expect(typeof CloudProviderIcon).toBe('function')
  })
})
