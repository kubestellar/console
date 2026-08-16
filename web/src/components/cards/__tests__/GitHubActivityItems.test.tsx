import { describe, it, expect } from 'vitest'
import * as Mod from '../GitHubActivityItems'

describe('GitHubActivityItems module', () => {
  it('exports the individual item components', () => {
    expect(typeof Mod.PRItem).toBe('function')
    expect(typeof Mod.IssueItem).toBe('function')
    expect(typeof Mod.ReleaseItem).toBe('function')
    expect(typeof Mod.ContributorItem).toBe('function')
    expect(typeof Mod.GitHubActivityItemSkeleton).toBe('function')
  })
})
