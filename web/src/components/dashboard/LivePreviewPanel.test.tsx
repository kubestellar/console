import { describe, it, expect } from 'vitest'
import * as LivePreviewPanelModule from './LivePreviewPanel'

describe('LivePreviewPanel Component', () => {
  it('exports LivePreviewPanel component', () => {
    expect(LivePreviewPanelModule.LivePreviewPanel).toBeDefined()
    expect(typeof LivePreviewPanelModule.LivePreviewPanel).toBe('function')
  })
})
