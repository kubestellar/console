import { describe, it, expect } from 'vitest'
import * as GitOpsModule from './GitOps'

describe('GitOps Component', () => {
  it('exports GitOps component', () => {
    expect(GitOpsModule.GitOps).toBeDefined()
    expect(typeof GitOpsModule.GitOps).toBe('function')
  })
})
