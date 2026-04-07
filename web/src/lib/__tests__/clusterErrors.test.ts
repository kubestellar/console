/**
 * Tests for clusterErrors utility.
 *
 * Covers friendlyErrorMessage mapping for all known error patterns:
 * - Docker not running
 * - Invalid cluster name
 * - Cluster already exists
 * - Unsupported tool
 * - Command not found
 * - Timeout / deadline exceeded
 * - Empty input
 * - Unknown / fallthrough messages
 */
import { describe, it, expect } from 'vitest'
import { friendlyErrorMessage } from '../clusterErrors'

describe('friendlyErrorMessage', () => {
  it('returns user-friendly message for "docker is not running"', () => {
    const result = friendlyErrorMessage('docker is not running')
    expect(result).toContain('Docker')
    expect(result).toContain('not running')
    expect(result).toContain('start')
  })

  it('matches case-insensitively for Docker errors', () => {
    const result = friendlyErrorMessage('Docker Is Not Running on this machine')
    expect(result).toContain('Docker')
    expect(result).toContain('start')
  })

  it('returns user-friendly message for invalid cluster name', () => {
    const result = friendlyErrorMessage('invalid cluster name: MY_CLUSTER')
    expect(result).toContain('Invalid cluster name')
    expect(result).toContain('lowercase')
  })

  it('matches "must consist of lower case alphanumeric"', () => {
    const result = friendlyErrorMessage('must consist of lower case alphanumeric characters')
    expect(result).toContain('Invalid cluster name')
  })

  it('matches "not a valid cluster name"', () => {
    const result = friendlyErrorMessage('not a valid cluster name')
    expect(result).toContain('Invalid cluster name')
  })

  it('matches "cluster names must match"', () => {
    const result = friendlyErrorMessage('cluster names must match RFC-1123')
    expect(result).toContain('Invalid cluster name')
  })

  it('returns user-friendly message for "already exists"', () => {
    const result = friendlyErrorMessage('cluster "test" already exists')
    expect(result).toContain('already exists')
    expect(result).toContain('different name')
  })

  it('returns user-friendly message for "unsupported tool"', () => {
    const result = friendlyErrorMessage('unsupported tool: nope')
    expect(result).toContain('not supported')
    expect(result).toContain('kind')
  })

  it('returns user-friendly message for "executable file not found"', () => {
    const result = friendlyErrorMessage('executable file not found in $PATH')
    expect(result).toContain('not found')
    expect(result).toContain('PATH')
  })

  it('matches "command not found"', () => {
    const result = friendlyErrorMessage('kind: command not found')
    expect(result).toContain('not found')
    expect(result).toContain('PATH')
  })

  it('returns user-friendly message for timeout errors', () => {
    const result = friendlyErrorMessage('context deadline exceeded')
    expect(result).toContain('timed out')
  })

  it('matches "timed out" variant', () => {
    const result = friendlyErrorMessage('operation timed out after 30s')
    expect(result).toContain('timed out')
  })

  it('matches "timeout" variant', () => {
    const result = friendlyErrorMessage('connection timeout waiting for cluster')
    expect(result).toContain('timed out')
  })

  it('returns "An unknown error occurred" for empty input', () => {
    const result = friendlyErrorMessage('')
    expect(result).toBe('An unknown error occurred.')
  })

  it('returns the raw message for unrecognized errors', () => {
    const raw = 'Something completely different happened'
    const result = friendlyErrorMessage(raw)
    expect(result).toBe(raw)
  })
})
