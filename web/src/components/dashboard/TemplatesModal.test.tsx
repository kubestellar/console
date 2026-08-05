import { describe, it, expect } from 'vitest'
import { TemplatesModal } from './TemplatesModal'

describe('TemplatesModal Component', () => {
  it('exports TemplatesModal component', () => {
    expect(TemplatesModal).toBeDefined()
    expect(typeof TemplatesModal).toBe('function')
  })
})
