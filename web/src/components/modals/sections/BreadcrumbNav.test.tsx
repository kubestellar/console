import { describe, it, expect } from 'vitest'
import { BreadcrumbNav } from './BreadcrumbNav'

describe('BreadcrumbNav Component', () => {
  it('exports BreadcrumbNav component', () => {
    expect(BreadcrumbNav).toBeDefined()
    expect(typeof BreadcrumbNav).toBe('function')
  })
})
