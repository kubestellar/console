import { describe, it, expect } from 'vitest'
import * as BreadcrumbNavModule from './BreadcrumbNav'

describe('BreadcrumbNav Component', () => {
  it('exports BreadcrumbNav component', () => {
    expect(BreadcrumbNavModule.BreadcrumbNav).toBeDefined()
    expect(typeof BreadcrumbNavModule.BreadcrumbNav).toBe('function')
  })
})
