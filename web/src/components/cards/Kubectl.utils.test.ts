/**
 * Unit tests for Kubectl.utils pure functions.
 * Covers: validateYAML, generateCommandFromPrompt, generateYAMLFromPrompt,
 * parseCommandArgs.
 *
 * Closes #21103
 */

import { describe, it, expect } from 'vitest'
import {
  validateYAML,
  generateCommandFromPrompt,
  generateYAMLFromPrompt,
  parseCommandArgs,
  YAML_PREVIEW_LINES,
} from './Kubectl.utils'

// ---------------------------------------------------------------------------
// validateYAML
// ---------------------------------------------------------------------------

describe('validateYAML', () => {
  it('returns valid for empty string', () => {
    const result = validateYAML('')
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })

  it('returns invalid when content contains tabs', () => {
    const result = validateYAML('key:\t value')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/tab/i)
  })

  it('returns valid for well-formed kubernetes YAML', () => {
    const yaml = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: my-app`
    const result = validateYAML(yaml)
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })

  it('returns invalid when YAML lacks apiVersion and kind', () => {
    const result = validateYAML('foo: bar')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns valid for whitespace-only string', () => {
    const result = validateYAML('   \n\t')
    // Whitespace-only is treated like empty
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// generateCommandFromPrompt
// ---------------------------------------------------------------------------

describe('generateCommandFromPrompt', () => {
  it('returns a command string for nginx deployment prompt', () => {
    const cmd = generateCommandFromPrompt('create deployment for nginx with 3 replicas')
    expect(cmd).toBeTruthy()
    expect(cmd).toContain('nginx')
  })

  it('returns pod list command for pod list prompt', () => {
    const cmd = generateCommandFromPrompt('pod list')
    expect(cmd).toContain('pods')
  })

  it('returns null for unknown prompt', () => {
    const cmd = generateCommandFromPrompt('something completely unrecognized xyz')
    expect(cmd).toBeNull()
  })

  it('generates scale command for scale deployment prompt', () => {
    const cmd = generateCommandFromPrompt('scale deployment my-app 5 replicas')
    expect(cmd).toContain('scale')
  })
})

// ---------------------------------------------------------------------------
// generateYAMLFromPrompt
// ---------------------------------------------------------------------------

describe('generateYAMLFromPrompt', () => {
  it('returns YAML containing apiVersion for nginx deployment prompt', () => {
    const yaml = generateYAMLFromPrompt('create deployment nginx with 2 replicas')
    expect(yaml).toContain('apiVersion')
    expect(yaml).toContain('kind')
  })

  it('returns service YAML for service prompt', () => {
    const yaml = generateYAMLFromPrompt('create a service')
    expect(yaml).toContain('kind')
    expect(yaml).toContain('Service')
  })

  it('returns configmap YAML for configmap prompt', () => {
    const yaml = generateYAMLFromPrompt('create configmap')
    expect(yaml).toContain('ConfigMap')
  })

  it('returns null for unknown prompt', () => {
    const yaml = generateYAMLFromPrompt('something unrecognized xyz')
    expect(yaml).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseCommandArgs
// ---------------------------------------------------------------------------

describe('parseCommandArgs', () => {
  it('splits simple command into args array', () => {
    const result = parseCommandArgs('get pods -n default', 'table', false)
    expect(result).toContain('get')
    expect(result).toContain('pods')
  })

  it('adds -o json flag when format is json', () => {
    const result = parseCommandArgs('get pods', 'json', false)
    expect(result).toContain('-o')
    expect(result).toContain('json')
  })

  it('adds --dry-run=client for apply with dryRun=true', () => {
    const result = parseCommandArgs('apply -f manifest.yaml', 'table', true)
    expect(result).toContain('--dry-run=client')
  })

  it('does not add --dry-run for get commands', () => {
    const result = parseCommandArgs('get pods', 'table', true)
    expect(result).not.toContain('--dry-run=client')
  })

  it('returns empty array for empty string', () => {
    const result = parseCommandArgs('', 'table', false)
    expect(Array.isArray(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// YAML_PREVIEW_LINES constant
// ---------------------------------------------------------------------------

describe('YAML_PREVIEW_LINES', () => {
  it('is a positive number', () => {
    expect(typeof YAML_PREVIEW_LINES).toBe('number')
    expect(YAML_PREVIEW_LINES).toBeGreaterThan(0)
  })
})
