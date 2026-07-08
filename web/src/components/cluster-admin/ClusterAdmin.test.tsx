import React from 'react'
import { describe, it, expect } from 'vitest'
import { ClusterAdmin } from './ClusterAdmin'

describe('ClusterAdmin Component', () => {
  it('exports ClusterAdmin component', () => {
    expect(ClusterAdmin).toBeDefined()
    expect(typeof ClusterAdmin).toBe('function')
  })
})
