import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sanitizeArg, runBinary, validateCommand, ALLOWED_BASE_COMMANDS } from '../mission-executor.mjs'

// ─── ALLOWED_BASE_COMMANDS ───────────────────────────────────────────

describe('ALLOWED_BASE_COMMANDS', () => {
  it('includes core Kubernetes tools', () => {
    expect(ALLOWED_BASE_COMMANDS.has('kubectl')).toBe(true)
    expect(ALLOWED_BASE_COMMANDS.has('helm')).toBe(true)
    expect(ALLOWED_BASE_COMMANDS.has('kustomize')).toBe(true)
    expect(ALLOWED_BASE_COMMANDS.has('istioctl')).toBe(true)
  })

  it('includes safe utilities', () => {
    for (const cmd of ['jq', 'yq', 'curl', 'grep', 'cat', 'echo', 'head', 'tail']) {
      expect(ALLOWED_BASE_COMMANDS.has(cmd)).toBe(true)
    }
  })

  it('excludes interpreter-capable tools', () => {
    expect(ALLOWED_BASE_COMMANDS.has('awk')).toBe(false)
    expect(ALLOWED_BASE_COMMANDS.has('sed')).toBe(false)
    expect(ALLOWED_BASE_COMMANDS.has('find')).toBe(false)
    expect(ALLOWED_BASE_COMMANDS.has('xargs')).toBe(false)
  })

  it('excludes shells', () => {
    expect(ALLOWED_BASE_COMMANDS.has('bash')).toBe(false)
    expect(ALLOWED_BASE_COMMANDS.has('sh')).toBe(false)
    expect(ALLOWED_BASE_COMMANDS.has('zsh')).toBe(false)
    expect(ALLOWED_BASE_COMMANDS.has('env')).toBe(false)
  })
})

// ─── sanitizeArg ─────────────────────────────────────────────────────

describe('sanitizeArg', () => {
  describe('accepts clean arguments', () => {
    it('passes simple strings', () => {
      expect(sanitizeArg('hello')).toBe('hello')
    })

    it('passes flags', () => {
      expect(sanitizeArg('--namespace=default')).toBe('--namespace=default')
      expect(sanitizeArg('-n')).toBe('-n')
    })

    it('passes file paths', () => {
      expect(sanitizeArg('/etc/kubernetes/admin.conf')).toBe('/etc/kubernetes/admin.conf')
      expect(sanitizeArg('./manifests/deploy.yaml')).toBe('./manifests/deploy.yaml')
    })

    it('passes Kubernetes resource names', () => {
      expect(sanitizeArg('my-deployment-v2')).toBe('my-deployment-v2')
      expect(sanitizeArg('namespace/resource')).toBe('namespace/resource')
    })

    it('passes JSON values', () => {
      expect(sanitizeArg('{"key":"value"}')).toBe('{"key":"value"}')
    })

    it('passes label selectors', () => {
      expect(sanitizeArg('app=nginx,tier=frontend')).toBe('app=nginx,tier=frontend')
    })
  })

  describe('rejects control characters', () => {
    it('rejects null bytes', () => {
      expect(() => sanitizeArg('hello\0world')).toThrow('control characters')
    })

    it('rejects carriage returns', () => {
      expect(() => sanitizeArg('hello\rworld')).toThrow('control characters')
    })

    it('rejects newlines', () => {
      expect(() => sanitizeArg('hello\nworld')).toThrow('control characters')
    })
  })

  describe('rejects shell metacharacters', () => {
    it('rejects dollar sign', () => {
      expect(() => sanitizeArg('$HOME')).toThrow('Unsafe argument')
    })

    it('rejects backtick', () => {
      expect(() => sanitizeArg('`whoami`')).toThrow('Unsafe argument')
    })

    it('rejects pipe', () => {
      expect(() => sanitizeArg('file | grep')).toThrow('Unsafe argument')
    })

    it('rejects greater-than redirect', () => {
      expect(() => sanitizeArg('output > /tmp/out')).toThrow('Unsafe argument')
    })

    it('rejects less-than redirect', () => {
      expect(() => sanitizeArg('input < /tmp/in')).toThrow('Unsafe argument')
    })

    it('rejects ampersand', () => {
      expect(() => sanitizeArg('cmd & bg')).toThrow('Unsafe argument')
    })

    it('rejects semicolon', () => {
      expect(() => sanitizeArg('cmd; evil')).toThrow('Unsafe argument')
    })

    it('rejects command substitution $()', () => {
      expect(() => sanitizeArg('$(whoami)')).toThrow('Unsafe argument')
    })

    it('rejects embedded command substitution', () => {
      expect(() => sanitizeArg('prefix$(id)suffix')).toThrow('Unsafe argument')
    })
  })
})

// ─── runBinary ───────────────────────────────────────────────────────

describe('runBinary', () => {
  describe('command allowlist enforcement', () => {
    it('blocks disallowed commands', () => {
      const result = runBinary('bash', ['-c', 'echo pwned'])
      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('[BLOCKED]')
      expect(result.error).toContain('Disallowed command')
    })

    it('blocks arbitrary binaries', () => {
      const result = runBinary('python3', ['-c', 'import os'])
      expect(result.success).toBe(false)
      expect(result.output).toContain('[BLOCKED]')
    })

    it('blocks env (allowlist escape)', () => {
      const result = runBinary('env', ['bash', '-c', 'whoami'])
      expect(result.success).toBe(false)
      expect(result.output).toContain('[BLOCKED]')
    })
  })

  describe('argument sanitization', () => {
    it('rejects arguments with shell metacharacters', () => {
      const result = runBinary('echo', ['$(whoami)'])
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsafe argument')
    })

    it('rejects arguments with null bytes', () => {
      const result = runBinary('echo', ['hello\0world'])
      expect(result.success).toBe(false)
      expect(result.error).toContain('control characters')
    })
  })

  describe('successful execution', () => {
    it('runs allowed commands and returns output', () => {
      const result = runBinary('echo', ['hello world'])
      expect(result.success).toBe(true)
      expect(result.output).toBe('hello world')
      expect(result.exitCode).toBe(0)
    })

    it('runs printf correctly', () => {
      const result = runBinary('printf', ['%s', 'test'])
      expect(result.success).toBe(true)
      expect(result.output).toBe('test')
    })

    it('handles multiple arguments', () => {
      const result = runBinary('echo', ['-n', 'no-newline'])
      expect(result.success).toBe(true)
      expect(result.output).toBe('no-newline')
    })
  })

  describe('failure handling', () => {
    it('returns failure for non-zero exit codes', () => {
      const result = runBinary('false', [])
      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(1)
    })

    it('returns failure for non-existent commands in PATH', () => {
      // 'which' is allowed but looking up a non-existent binary returns non-zero
      const result = runBinary('which', ['nonexistent_binary_xyz'])
      expect(result.success).toBe(false)
    })
  })

  describe('input handling', () => {
    it('passes stdin input to command', () => {
      const result = runBinary('cat', [], { input: 'hello from stdin' })
      expect(result.success).toBe(true)
      expect(result.output).toBe('hello from stdin')
    })

    it('passes multiline stdin', () => {
      const result = runBinary('wc', ['-l'], { input: 'line1\nline2\nline3\n' })
      expect(result.success).toBe(true)
      expect(result.output.trim()).toBe('3')
    })
  })
})

// ─── validateCommand ─────────────────────────────────────────────────

describe('validateCommand', () => {
  describe('allows safe commands', () => {
    it('allows simple kubectl', () => {
      expect(validateCommand('kubectl get pods')).toEqual({ safe: true })
    })

    it('allows helm install', () => {
      expect(validateCommand('helm install my-release ./chart')).toEqual({ safe: true })
    })

    it('allows curl', () => {
      expect(validateCommand('curl -s https://example.com')).toEqual({ safe: true })
    })
  })

  describe('blocks injection patterns', () => {
    it('blocks subshell expansion $()', () => {
      const result = validateCommand('kubectl get pods $(whoami)')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('Subshell expansion')
    })

    it('blocks backtick substitution', () => {
      const result = validateCommand('kubectl get pods `whoami`')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('Backtick')
    })

    it('blocks bash -c', () => {
      const result = validateCommand('bash -c "rm -rf /"')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('Shell -c')
    })

    it('blocks sh -c', () => {
      const result = validateCommand('sh -c "evil"')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('Shell -c')
    })

    it('blocks kubectl exec with --', () => {
      const result = validateCommand('kubectl exec pod -- /bin/bash')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('kubectl exec')
    })

    it('blocks kubectl run with --', () => {
      const result = validateCommand('kubectl run test -- evil-cmd')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('kubectl exec/run/cp')
    })

    it('blocks pipes', () => {
      const result = validateCommand('kubectl get pods | grep nginx')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('Pipes and redirections')
    })

    it('blocks output redirection', () => {
      const result = validateCommand('echo pwned > /etc/passwd')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('Pipes and redirections')
    })

    it('blocks disallowed base commands', () => {
      const result = validateCommand('python3 -c "import os"')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('Disallowed command')
    })

    it('blocks find -exec', () => {
      const result = validateCommand('find / -exec rm {} +')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('find/xargs -exec')
    })

    it('blocks xargs -exec', () => {
      const result = validateCommand('xargs -exec cat')
      expect(result.safe).toBe(false)
      expect(result.reason).toContain('find/xargs -exec')
    })
  })
})
