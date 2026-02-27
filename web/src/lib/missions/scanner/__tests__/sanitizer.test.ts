import { describe, it, expect } from 'vitest'
import { sanitizeMission, generateSanitizationPreview } from '../sanitizer'
import { scanForSensitiveData } from '../sensitive'
import type { MissionExport } from '../../types'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: '1.0',
    title: 'Test Mission',
    description: 'A test mission for scanning',
    type: 'troubleshoot',
    tags: ['test'],
    steps: [],
    ...overrides,
  }
}

function makeStep(desc: string, extra: Record<string, string> = {}) {
  return { title: 'Step', description: desc, ...extra }
}

describe('sanitizeMission', () => {
  it('replaces the same IP consistently across messages', () => {
    const mission = makeMission({
      steps: [
        makeStep('Connect to 10.0.0.5'),
        makeStep('Also try 10.0.0.5 again'),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    expect(result.mission.steps[0].description).toContain('<REDACTED-IP-1>')
    expect(result.mission.steps[1].description).toContain('<REDACTED-IP-1>')
    expect(result.mission.steps[0].description).not.toContain('10.0.0.5')
    expect(result.mission.steps[1].description).not.toContain('10.0.0.5')
  })

  it('assigns different tokens to different IPs', () => {
    const mission = makeMission({
      steps: [
        makeStep('Server A: 10.0.0.5'),
        makeStep('Server B: 10.0.0.6'),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    expect(result.mission.steps[0].description).toContain('<REDACTED-IP-1>')
    expect(result.mission.steps[1].description).toContain('<REDACTED-IP-2>')
  })

  it('replaces internal hostnames with REDACTED-HOST tokens', () => {
    const mission = makeMission({
      steps: [makeStep('SSH to node-abc.internal')],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    expect(result.mission.steps[0].description).toContain('<REDACTED-HOST-1>')
    expect(result.mission.steps[0].description).not.toContain(
      'node-abc.internal'
    )
  })

  it('replaces secrets with REDACTED-SECRET tokens', () => {
    const mission = makeMission({
      steps: [makeStep('Key: AKIAIOSFODNN7EXAMPLE')],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    expect(result.mission.steps[0].description).toContain(
      '<REDACTED-SECRET-1>'
    )
    expect(result.mission.steps[0].description).not.toContain(
      'AKIAIOSFODNN7EXAMPLE'
    )
  })

  it('does not mutate the original mission', () => {
    const mission = makeMission({
      steps: [makeStep('IP: 10.0.0.5')],
    })
    const originalDesc = mission.steps[0].description
    const findings = scanForSensitiveData(mission)
    sanitizeMission(mission, findings)

    expect(mission.steps[0].description).toBe(originalDesc)
    expect(mission.steps[0].description).toContain('10.0.0.5')
  })

  it('only redacts selected findings when selectedFindings provided', () => {
    const mission = makeMission({
      steps: [makeStep('A: 10.0.0.5 and B: 10.0.0.6')],
    })
    const findings = scanForSensitiveData(mission)
    const ipFindings = findings.filter((f) => f.type === 'ipv4')
    expect(ipFindings.length).toBeGreaterThanOrEqual(2)

    // Only select the first IP for redaction
    const result = sanitizeMission(mission, findings, [ipFindings[0]])

    expect(result.mission.steps[0].description).toContain('<REDACTED-IP-1>')
    expect(result.mission.steps[0].description).toContain('10.0.0.6')
  })

  it('reports correct replacement count', () => {
    const mission = makeMission({
      steps: [
        makeStep('IP: 10.0.0.5'),
        makeStep('Same IP: 10.0.0.5'),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    expect(result.replacementCount).toBeGreaterThanOrEqual(2)
  })

  it('produces valid JSON after sanitization', () => {
    const mission = makeMission({
      steps: [makeStep('Key: AKIAIOSFODNN7EXAMPLE and IP: 10.0.0.5')],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    const json = JSON.stringify(result.mission)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('preserves non-sensitive fields after sanitization', () => {
    const mission = makeMission({
      steps: [makeStep('IP: 10.0.0.5')],
      category: 'networking',
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    expect(result.mission.version).toBe('1.0')
    expect(result.mission.type).toBe('troubleshoot')
    expect(result.mission.tags).toEqual(['test'])
    expect(result.mission.category).toBe('networking')
  })

  it('sets security.sanitized flag to true', () => {
    const mission = makeMission({
      steps: [makeStep('IP: 10.0.0.5')],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    expect(result.mission.security.sanitized).toBe(true)
  })

  it('returns identical content with no findings', () => {
    const mission = makeMission({
      steps: [makeStep('Clean step with no sensitive data')],
    })
    const result = sanitizeMission(mission, [])

    expect(result.mission.steps[0].description).toBe(
      'Clean step with no sensitive data'
    )
    expect(result.replacementCount).toBe(0)
    expect(Object.keys(result.replacements)).toHaveLength(0)
  })

  it('survives round-trip: sanitize → JSON → parse → valid', () => {
    const mission = makeMission({
      steps: [makeStep('Secret: AKIAIOSFODNN7EXAMPLE at 10.0.0.5')],
    })
    const findings = scanForSensitiveData(mission)
    const result = sanitizeMission(mission, findings)

    const json = JSON.stringify(result.mission)
    const parsed = JSON.parse(json)

    expect(parsed.version).toBe('1.0')
    expect(parsed.title).toBe('Test Mission')
    expect(parsed.steps[0].description).toContain('<REDACTED-')
    expect(parsed.security.sanitized).toBe(true)
  })
})

describe('generateSanitizationPreview', () => {
  it('returns preview items with correct locations', () => {
    const mission = makeMission({
      steps: [
        makeStep('IP: 10.0.0.5'),
        makeStep('Key: AKIAIOSFODNN7EXAMPLE'),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const preview = generateSanitizationPreview(mission, findings)

    expect(preview.length).toBeGreaterThanOrEqual(2)

    const ipPreview = preview.find((p) => p.original === '10.0.0.5')
    expect(ipPreview).toBeDefined()
    expect(ipPreview!.location).toBe('steps[0].description')
    expect(ipPreview!.sanitized).toContain('<REDACTED-IP-')

    const keyPreview = preview.find(
      (p) => p.original === 'AKIAIOSFODNN7EXAMPLE'
    )
    expect(keyPreview).toBeDefined()
    expect(keyPreview!.sanitized).toContain('<REDACTED-SECRET-')
  })
})
