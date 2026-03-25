import { describe, it, expect } from 'vitest'
import { friendlyErrorMessage } from './clusterErrors'

describe('friendlyErrorMessage', () => {
  it('returns fallback for empty string', () => {
    expect(friendlyErrorMessage('')).toBe('An unknown error occurred.')
  })

  it('maps Docker-not-running errors', () => {
    const raw = 'Docker is not running. Start Docker Desktop or Rancher Desktop first. (Cannot connect to daemon)'
    expect(friendlyErrorMessage(raw)).toContain('Docker is not running')
    expect(friendlyErrorMessage(raw)).toContain('Docker Desktop')
  })

  it('maps cluster-already-exists errors', () => {
    const raw = 'kind create failed: cluster "test" already exists'
    expect(friendlyErrorMessage(raw)).toContain('already exists')
    expect(friendlyErrorMessage(raw)).toContain('different name')
  })

  it('maps unsupported tool errors', () => {
    const raw = 'unsupported tool: foobar'
    expect(friendlyErrorMessage(raw)).toContain('not supported')
  })

  it('maps invalid cluster name errors', () => {
    const raw = 'invalid cluster name: must consist of lower case alphanumeric characters'
    expect(friendlyErrorMessage(raw)).toContain('lowercase letters')
  })

  it('maps kind-specific cluster name validation errors', () => {
    const raw = "kind create failed: ERROR: failed to create cluster: 'Demo' is not a valid cluster name, cluster names must match ^[a-z0-9.-]+$"
    expect(friendlyErrorMessage(raw)).toContain('lowercase letters')
    expect(friendlyErrorMessage(raw)).toContain('hyphens')
  })

  it('maps executable-not-found errors', () => {
    const raw = 'exec: "kind": executable file not found in $PATH'
    expect(friendlyErrorMessage(raw)).toContain('not found on the system PATH')
  })

  it('maps command-not-found errors', () => {
    const raw = 'sh: kind: command not found'
    expect(friendlyErrorMessage(raw)).toContain('not found on the system PATH')
  })

  it('maps timeout errors', () => {
    expect(friendlyErrorMessage('context deadline exceeded')).toContain('timed out')
    expect(friendlyErrorMessage('operation timed out after 120s')).toContain('timed out')
  })

  it('passes through unknown errors unchanged', () => {
    const raw = 'some unexpected backend error: port 443 refused'
    expect(friendlyErrorMessage(raw)).toBe(raw)
  })
})
