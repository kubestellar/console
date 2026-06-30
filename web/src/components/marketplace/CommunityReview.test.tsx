import React from 'react'
import { describe, it, expect } from 'vitest'
import { CommunityReviewPanel } from './CommunityReview'

describe('CommunityReviewPanel', () => {
  it('exports CommunityReviewPanel component', () => {
    expect(CommunityReviewPanel).toBeDefined()
    expect(typeof CommunityReviewPanel).toBe('function')
  })
})
