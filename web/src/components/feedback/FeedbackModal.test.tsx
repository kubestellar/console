import { describe, it, expect } from 'vitest'
import * as FeedbackModalModule from './FeedbackModal'

describe('FeedbackModal Component', () => {
  it('exports FeedbackModal component', () => {
    expect(FeedbackModalModule.FeedbackModal).toBeDefined()
    expect(typeof FeedbackModalModule.FeedbackModal).toBe('function')
  })
})
