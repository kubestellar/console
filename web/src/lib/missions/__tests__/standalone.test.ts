import { describe, it, expect, vi } from 'vitest'

// Mock the scanner/index module
vi.mock('../scanner/index', () => ({
  fullScan: vi.fn((data) => ({
    valid: true,
    findings: [],
    metadata: { title: data?.name || 'Test Mission', type: 'install', version: '1.0' },
  })),
}))

// Mock the types module
vi.mock('../types', () => ({
  validateMissionExport: vi.fn((data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        valid: false,
        errors: [{ message: 'Not an object', path: '' }],
      }
    }
    return { valid: true, data }
  }),
}))

import { scanMissionFile, formatScanResultAsMarkdown } from '../scanner/standalone'
import { validateMissionExport } from '../types'
import type { FileScanResult } from '../types'

describe('scanMissionFile', () => {
  it('returns parse error for invalid JSON', () => {
    const result = scanMissionFile('{ not valid json }')
    expect(result.valid).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].code).toBe('PARSE_ERROR')
    expect(result.findings[0].severity).toBe('error')
  })

  it('returns schema validation errors for invalid data', () => {
    vi.mocked(validateMissionExport).mockReturnValueOnce({
      valid: false,
      errors: [{ message: 'Missing required field: steps', path: '.steps' }],
    } as never)

    const result = scanMissionFile('{}')
    expect(result.valid).toBe(false)
    expect(result.findings[0].code).toBe('SCHEMA_VALIDATION')
    expect(result.findings[0].message).toContain('Missing required field')
  })

  it('runs full scan for valid mission file', () => {
    const mission = { name: 'install-cert-manager', steps: [] }
    const result = scanMissionFile(JSON.stringify(mission))
    expect(result.valid).toBe(true)
    expect(result.findings).toHaveLength(0)
    expect(result.metadata).toBeDefined()
  })

  it('handles empty JSON string', () => {
    const result = scanMissionFile('')
    expect(result.valid).toBe(false)
    expect(result.findings[0].code).toBe('PARSE_ERROR')
  })

  it('handles null JSON value', () => {
    const result = scanMissionFile('null')
    expect(result.valid).toBe(false)
  })

  it('handles JSON array instead of object', () => {
    const result = scanMissionFile('[]')
    expect(result.valid).toBe(false)
  })
})

describe('formatScanResultAsMarkdown', () => {
  it('formats a passing result with no findings', () => {
    const result: FileScanResult = {
      valid: true,
      findings: [],
      metadata: { title: 'Test', type: 'install', version: '1.0' },
    }

    const md = formatScanResultAsMarkdown('test.json', result)
    expect(md).toContain('Mission Scan: test.json')
    expect(md).toContain('Passed')
    expect(md).toContain('No issues found')
  })

  it('formats a failing result with findings', () => {
    const result: FileScanResult = {
      valid: false,
      findings: [
        { severity: 'error', code: 'MISSING_FIELD', message: 'Steps required', path: '.steps' },
        { severity: 'warning', code: 'DEPRECATED', message: 'Old format', path: '.version' },
      ],
      metadata: null,
    }

    const md = formatScanResultAsMarkdown('bad.json', result)
    expect(md).toContain('Failed')
    expect(md).toContain('MISSING_FIELD')
    expect(md).toContain('Steps required')
    expect(md).toContain('DEPRECATED')
    expect(md).toContain('1 error(s)')
    expect(md).toContain('1 warning(s)')
  })

  it('includes metadata when available', () => {
    const result: FileScanResult = {
      valid: true,
      findings: [],
      metadata: { title: 'Install Cert Manager', type: 'install', version: '2.0' },
    }

    const md = formatScanResultAsMarkdown('cert-manager.json', result)
    expect(md).toContain('Install Cert Manager')
    expect(md).toContain('install')
    expect(md).toContain('2.0')
  })

  it('handles null metadata gracefully', () => {
    const result: FileScanResult = {
      valid: true,
      findings: [],
      metadata: null,
    }

    const md = formatScanResultAsMarkdown('test.json', result)
    expect(md).toContain('Passed')
    expect(md).not.toContain('undefined')
  })

  it('formats the markdown table correctly', () => {
    const result: FileScanResult = {
      valid: false,
      findings: [
        { severity: 'error', code: 'TEST', message: 'Test message', path: '.field' },
      ],
      metadata: null,
    }

    const md = formatScanResultAsMarkdown('test.json', result)
    expect(md).toContain('| Severity | Code | Message | Path |')
    expect(md).toContain('|----------|------|---------|------|')
    expect(md).toContain('`TEST`')
    expect(md).toContain('`.field`')
  })

  it('shows summary with counts', () => {
    const result: FileScanResult = {
      valid: false,
      findings: [
        { severity: 'error', code: 'E1', message: 'Error 1', path: '' },
        { severity: 'error', code: 'E2', message: 'Error 2', path: '' },
        { severity: 'warning', code: 'W1', message: 'Warning 1', path: '' },
        { severity: 'info', code: 'I1', message: 'Info 1', path: '' },
      ],
      metadata: null,
    }

    const md = formatScanResultAsMarkdown('test.json', result)
    expect(md).toContain('2 error(s)')
    expect(md).toContain('1 warning(s)')
    expect(md).toContain('1 info')
  })

  it('escapes pipe characters in messages', () => {
    const result: FileScanResult = {
      valid: false,
      findings: [
        { severity: 'error', code: 'PIPE', message: 'value|has|pipes', path: 'a|b' },
      ],
      metadata: null,
    }

    const md = formatScanResultAsMarkdown('test.json', result)
    expect(md).toContain('value\\|has\\|pipes')
  })
})
