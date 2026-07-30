import { describe, it, expect } from 'vitest'
import { SecurityIssueSchema, SecurityIssuesResponseSchema } from '../security'

describe('SecurityIssueSchema', () => {
  it('parses valid issue with required fields', () => {
    const result = SecurityIssueSchema.parse({
      name: 'pod-1',
      namespace: 'default',
      issue: 'Privileged container',
      severity: 'high',
    })
    expect(result.name).toBe('pod-1')
    expect(result.severity).toBe('high')
  })

  it('parses issue with optional fields', () => {
    const result = SecurityIssueSchema.parse({
      name: 'pod-1',
      namespace: 'default',
      issue: 'No resource limits',
      severity: 'medium',
      cluster: 'prod-east',
      details: 'Container lacks memory limits',
    })
    expect(result.cluster).toBe('prod-east')
    expect(result.details).toBe('Container lacks memory limits')
  })

  it('rejects invalid severity', () => {
    expect(() =>
      SecurityIssueSchema.parse({
        name: 'pod-1',
        namespace: 'default',
        issue: 'test',
        severity: 'critical',
      })
    ).toThrow()
  })

  it('accepts all valid severities', () => {
    for (const severity of ['high', 'medium', 'low']) {
      const result = SecurityIssueSchema.parse({
        name: 'pod-1',
        namespace: 'default',
        issue: 'test',
        severity,
      })
      expect(result.severity).toBe(severity)
    }
  })
})

describe('SecurityIssuesResponseSchema', () => {
  it('parses valid response with issues array', () => {
    const result = SecurityIssuesResponseSchema.parse({
      issues: [
        { name: 'pod-1', namespace: 'default', issue: 'test', severity: 'low' },
      ],
    })
    expect(result.issues).toHaveLength(1)
  })

  it('parses empty issues array', () => {
    const result = SecurityIssuesResponseSchema.parse({ issues: [] })
    expect(result.issues).toHaveLength(0)
  })

  it('rejects missing issues field', () => {
    expect(() => SecurityIssuesResponseSchema.parse({})).toThrow()
  })
})
