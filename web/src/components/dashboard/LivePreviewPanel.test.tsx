import { describe, it, expect } from 'vitest'
import { LivePreviewPanel } from './LivePreviewPanel'

describe('LivePreviewPanel Component', () => {
  it('exports LivePreviewPanel component', () => {
    expect(LivePreviewPanel).toBeDefined()
    expect(typeof LivePreviewPanel).toBe('function')
  })
})
