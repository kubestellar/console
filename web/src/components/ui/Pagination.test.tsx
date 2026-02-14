import { describe, it, expect } from 'vitest'
import * as PaginationModule from './Pagination'

describe('Pagination Component', () => {
  it('exports Pagination component', () => {
    expect(PaginationModule.Pagination).toBeDefined()
    expect(typeof PaginationModule.Pagination).toBe('function')
  })

  it('exports usePagination hook', () => {
    expect(PaginationModule.usePagination).toBeDefined()
    expect(typeof PaginationModule.usePagination).toBe('function')
  })
})
