import { describe, it, expect } from 'vitest'
import * as AlertRuleEditorModule from './AlertRuleEditor'

describe('AlertRuleEditor Component', () => {
  it('exports AlertRuleEditor component', () => {
    expect(AlertRuleEditorModule.AlertRuleEditor).toBeDefined()
    expect(typeof AlertRuleEditorModule.AlertRuleEditor).toBe('function')
  })
})
