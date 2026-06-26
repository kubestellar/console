import { describe, it, expect } from 'vitest'
import { Pagination, usePagination } from './Pagination'

describe('Pagination Component', () => {
  it('exports Pagination component', () => {
    expect(Pagination).toBeDefined()
    expect(typeof Pagination).toBe('function')
  })

  it('exports usePagination hook', () => {
    expect(usePagination).toBeDefined()
    expect(typeof usePagination).toBe('function')
  })
})
