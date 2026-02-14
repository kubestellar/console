import { describe, it, expect } from 'vitest'
import * as PaginatedListModule from './PaginatedList'

describe('PaginatedList Component', () => {
  it('exports PaginatedList component', () => {
    expect(PaginatedListModule.PaginatedList).toBeDefined()
    expect(typeof PaginatedListModule.PaginatedList).toBe('function')
  })
})
