import { describe, it, expect } from 'vitest'
import DataPacket from './DataPacket'

describe('DataPacket Component', () => {
  it('exports DataPacket component as default', () => {
    expect(DataPacket).toBeDefined()
    expect(typeof DataPacket).toBe('function')
  })
})
