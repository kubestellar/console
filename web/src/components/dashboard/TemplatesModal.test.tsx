import { describe, it, expect } from 'vitest'
import * as TemplatesModalModule from './TemplatesModal'

describe('TemplatesModal Component', () => {
  it('exports TemplatesModal component', () => {
    expect(TemplatesModalModule.TemplatesModal).toBeDefined()
    expect(typeof TemplatesModalModule.TemplatesModal).toBe('function')
  })
})
