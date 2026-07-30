import { describe, it, expect } from 'vitest'
import {
  YAML_PREVIEW_LINES,
  validateYAML,
  generateCommandFromPrompt,
  generateYAMLFromPrompt,
  parseCommandArgs,
} from '../Kubectl.utils'

// ─── Constants ───────────────────────────────────────────────────────────────

describe('Kubectl.utils constants', () => {
  it('YAML_PREVIEW_LINES is 5', () => {
    expect(YAML_PREVIEW_LINES).toBe(5)
  })
})

// ─── validateYAML ────────────────────────────────────────────────────────────

describe('validateYAML', () => {
  it('returns valid for empty/whitespace input', () => {
    expect(validateYAML('')).toEqual({ valid: true, error: null })
    expect(validateYAML('   ')).toEqual({ valid: true, error: null })
  })

  it('returns valid for YAML with apiVersion and kind', () => {
    const yaml = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: test'
    expect(validateYAML(yaml)).toEqual({ valid: true, error: null })
  })

  it('rejects YAML containing tabs', () => {
    const yaml = 'apiVersion: v1\n\tkind: Pod'
    const result = validateYAML(yaml)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("Line 2")
    expect(result.error).toContain("tabs")
  })

  it('rejects content without apiVersion and kind', () => {
    const yaml = 'name: something\nvalue: other'
    const result = validateYAML(yaml)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('apiVersion')
  })

  it('detects tabs on the first line', () => {
    const yaml = '\tapiVersion: v1'
    const result = validateYAML(yaml)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("Line 1")
  })

  it('valid with multi-document YAML containing apiVersion and kind', () => {
    const yaml = 'apiVersion: apps/v1\nkind: Deployment\n---\napiVersion: v1\nkind: Service'
    expect(validateYAML(yaml).valid).toBe(true)
  })
})

// ─── generateCommandFromPrompt ───────────────────────────────────────────────

describe('generateCommandFromPrompt', () => {
  it('generates nginx deployment with default replicas', () => {
    const result = generateCommandFromPrompt('create a deployment nginx')
    expect(result).toBe('create deployment nginx --image=nginx --replicas=3')
  })

  it('generates nginx deployment with specified replicas', () => {
    const result = generateCommandFromPrompt('create deployment nginx with 5 replicas')
    expect(result).toBe('create deployment nginx --image=nginx --replicas=5')
  })

  it('generates pod list command', () => {
    const result = generateCommandFromPrompt('list all pods')
    expect(result).toBe('get pods --all-namespaces')
  })

  it('generates scale command with deployment name', () => {
    const result = generateCommandFromPrompt('scale deployment my-app to 10 replicas')
    expect(result).toBe('scale deployment my-app --replicas=10')
  })

  it('generates scale command with default name', () => {
    const result = generateCommandFromPrompt('scale deploy to 5 replicas')
    expect(result).toBe('scale deployment my-deployment --replicas=5')
  })

  it('generates delete pod command', () => {
    const result = generateCommandFromPrompt('delete the pod')
    expect(result).toBe('delete pod <pod-name>')
  })

  it('generates logs command', () => {
    const result = generateCommandFromPrompt('show me logs')
    expect(result).toBe('logs <pod-name>')
  })

  it('generates describe command', () => {
    const result = generateCommandFromPrompt('describe node worker-1')
    expect(result).toBe('describe node <name>')
  })

  it('returns null for unrecognized prompts', () => {
    expect(generateCommandFromPrompt('hello world')).toBeNull()
    expect(generateCommandFromPrompt('what is kubernetes')).toBeNull()
  })
})

// ─── generateYAMLFromPrompt ──────────────────────────────────────────────────

describe('generateYAMLFromPrompt', () => {
  it('generates nginx deployment YAML with default replicas', () => {
    const result = generateYAMLFromPrompt('create a deployment for nginx')
    expect(result).not.toBeNull()
    expect(result).toContain('apiVersion: apps/v1')
    expect(result).toContain('kind: Deployment')
    expect(result).toContain('replicas: 3')
    expect(result).toContain('image: nginx:latest')
  })

  it('generates nginx deployment YAML with specified replicas', () => {
    const result = generateYAMLFromPrompt('deployment nginx 5 replicas')
    expect(result).toContain('replicas: 5')
  })

  it('generates service YAML', () => {
    const result = generateYAMLFromPrompt('create a service')
    expect(result).not.toBeNull()
    expect(result).toContain('apiVersion: v1')
    expect(result).toContain('kind: Service')
    expect(result).toContain('port: 80')
    expect(result).toContain('type: ClusterIP')
  })

  it('generates configmap YAML', () => {
    const result = generateYAMLFromPrompt('create a configmap')
    expect(result).not.toBeNull()
    expect(result).toContain('apiVersion: v1')
    expect(result).toContain('kind: ConfigMap')
    expect(result).toContain('config.json')
  })

  it('returns null for unrecognized prompts', () => {
    expect(generateYAMLFromPrompt('hello world')).toBeNull()
    expect(generateYAMLFromPrompt('list pods')).toBeNull()
  })
})

// ─── parseCommandArgs ────────────────────────────────────────────────────────

describe('parseCommandArgs', () => {
  it('splits command into args array', () => {
    const result = parseCommandArgs('get pods', 'table', false)
    expect(result).toEqual(['get', 'pods'])
  })

  it('adds output format when not table', () => {
    const result = parseCommandArgs('get pods', 'json', false)
    expect(result).toEqual(['get', 'pods', '-o', 'json'])
  })

  it('adds yaml output format', () => {
    const result = parseCommandArgs('get pod nginx', 'yaml', false)
    expect(result).toEqual(['get', 'pod', 'nginx', '-o', 'yaml'])
  })

  it('does not add output format when already specified with -o', () => {
    const result = parseCommandArgs('get pods -o wide', 'json', false)
    expect(result).toEqual(['get', 'pods', '-o', 'wide'])
  })

  it('does not add output format when --output specified', () => {
    const result = parseCommandArgs('get pods --output json', 'yaml', false)
    expect(result).toEqual(['get', 'pods', '--output', 'json'])
  })

  it('adds --dry-run=client for apply command', () => {
    const result = parseCommandArgs('apply -f deployment.yaml', 'table', true)
    expect(result).toContain('--dry-run=client')
  })

  it('adds --dry-run=client for create command', () => {
    const result = parseCommandArgs('create deployment test', 'table', true)
    expect(result).toContain('--dry-run=client')
  })

  it('adds --dry-run=client for delete command', () => {
    const result = parseCommandArgs('delete pod test', 'table', true)
    expect(result).toContain('--dry-run=client')
  })

  it('does not add --dry-run for get command', () => {
    const result = parseCommandArgs('get pods', 'table', true)
    expect(result).not.toContain('--dry-run=client')
  })

  it('does not add --dry-run if already present', () => {
    const result = parseCommandArgs('apply --dry-run -f test.yaml', 'table', true)
    const dryRunCount = result.filter(a => a.includes('dry-run')).length
    expect(dryRunCount).toBe(1)
  })

  it('trims whitespace from command', () => {
    const result = parseCommandArgs('  get  pods  ', 'table', false)
    expect(result).toEqual(['get', 'pods'])
  })

  it('combines output format and dry-run', () => {
    const result = parseCommandArgs('apply -f test.yaml', 'json', true)
    expect(result).toContain('-o')
    expect(result).toContain('json')
    expect(result).toContain('--dry-run=client')
  })
})
