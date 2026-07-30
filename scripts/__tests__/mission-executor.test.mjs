// @vitest-environment node
/**
 * Unit tests for mission-executor.mjs
 * Tests sanitizeArg and runBinary functions for security-critical command execution
 *
 * Related: Issue #2837
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { sanitizeArg, runBinary } from '../mission-executor.mjs';

// Mock spawnSync
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

// ── sanitizeArg Tests ──────────────────────────────────────────────────────

describe('sanitizeArg', () => {
  describe('accepts clean arguments', () => {
    it('accepts alphanumeric strings', () => {
      expect(sanitizeArg('abc123')).toBe('abc123');
    });

    it('accepts file paths', () => {
      expect(sanitizeArg('/usr/bin/kubectl')).toBe('/usr/bin/kubectl');
      expect(sanitizeArg('./config.yaml')).toBe('./config.yaml');
      expect(sanitizeArg('../data/file.txt')).toBe('../data/file.txt');
    });

    it('accepts flags', () => {
      expect(sanitizeArg('--namespace')).toBe('--namespace');
      expect(sanitizeArg('-n')).toBe('-n');
      expect(sanitizeArg('--flag=value')).toBe('--flag=value');
    });

    it('accepts URLs', () => {
      expect(sanitizeArg('https://api.example.com')).toBe('https://api.example.com');
      expect(sanitizeArg('http://localhost:8080')).toBe('http://localhost:8080');
    });

    it('accepts special safe characters', () => {
      expect(sanitizeArg('name_with-dashes.yaml')).toBe('name_with-dashes.yaml');
      expect(sanitizeArg('arg:value')).toBe('arg:value');
      expect(sanitizeArg('value@hostname')).toBe('value@hostname');
      expect(sanitizeArg('hash#tag')).toBe('hash#tag');
    });

    it('accepts empty string', () => {
      expect(sanitizeArg('')).toBe('');
    });
  });

  describe('rejects control characters', () => {
    it('rejects null bytes', () => {
      expect(() => sanitizeArg('hello\0world')).toThrow('null byte');
    });

    it('rejects carriage returns', () => {
      expect(() => sanitizeArg('hello\rworld')).toThrow('control characters');
    });

    it('rejects newlines', () => {
      expect(() => sanitizeArg('hello\nworld')).toThrow('control characters');
    });
  });

  describe('rejects shell metacharacters', () => {
    it('rejects dollar sign', () => {
      expect(() => sanitizeArg('$VAR')).toThrow('dangerous character: $');
    });

    it('rejects backticks', () => {
      expect(() => sanitizeArg('`command`')).toThrow('dangerous character: `');
    });

    it('rejects pipe', () => {
      expect(() => sanitizeArg('arg | cmd')).toThrow('dangerous character: |');
    });

    it('rejects redirect greater-than', () => {
      expect(() => sanitizeArg('file > output')).toThrow('dangerous character: >');
    });

    it('rejects redirect less-than', () => {
      expect(() => sanitizeArg('input < file')).toThrow('dangerous character: <');
    });

    it('rejects ampersand', () => {
      expect(() => sanitizeArg('cmd &')).toThrow('dangerous character: &');
    });

    it('rejects semicolon', () => {
      expect(() => sanitizeArg('cmd; rm -rf /')).toThrow('dangerous character: ;');
    });
  });

  describe('rejects command substitution', () => {
    it('rejects $(command) syntax', () => {
      expect(() => sanitizeArg('$(whoami)')).toThrow('command substitution');
    });

    it('rejects $(...) with nested commands', () => {
      expect(() => sanitizeArg('prefix$(date)suffix')).toThrow('command substitution');
    });
  });

  describe('validates input type', () => {
    it('rejects non-string input', () => {
      expect(() => sanitizeArg(123)).toThrow('must be a string');
      expect(() => sanitizeArg(null)).toThrow('must be a string');
      expect(() => sanitizeArg(undefined)).toThrow('must be a string');
      expect(() => sanitizeArg({})).toThrow('must be a string');
      expect(() => sanitizeArg([])).toThrow('must be a string');
    });
  });

  describe('edge cases', () => {
    it('rejects mixed safe and dangerous characters', () => {
      expect(() => sanitizeArg('valid-prefix$INJECTED')).toThrow('dangerous character: $');
    });

    it('rejects multiple dangerous characters', () => {
      expect(() => sanitizeArg('`cat /etc/passwd`; rm -rf /')).toThrow('dangerous character');
    });
  });
});

// ── runBinary Tests ────────────────────────────────────────────────────────

describe('runBinary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('allowlist enforcement', () => {
    it('allows kubectl', () => {
      spawnSync.mockReturnValue({
        stdout: 'output',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('kubectl', ['get', 'pods']);

      expect(result.exitCode).toBe(0);
      expect(spawnSync).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'pods'],
        expect.objectContaining({ shell: false })
      );
    });

    it('allows helm', () => {
      spawnSync.mockReturnValue({
        stdout: 'Helm v3',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('helm', ['version']);

      expect(result.exitCode).toBe(0);
      expect(spawnSync).toHaveBeenCalledWith('helm', ['version'], expect.anything());
    });

    it('allows git', () => {
      spawnSync.mockReturnValue({
        stdout: 'main',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('git', ['branch', '--show-current']);

      expect(result.exitCode).toBe(0);
    });

    it('blocks awk (not in allowlist)', () => {
      const result = runBinary('awk', ['{print $1}']);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('not in the allowlist');
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('blocks sed (not in allowlist)', () => {
      const result = runBinary('sed', ['s/old/new/']);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('not in the allowlist');
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('blocks find (not in allowlist)', () => {
      const result = runBinary('find', ['.', '-name', '*.js']);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('not in the allowlist');
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('blocks xargs (not in allowlist)', () => {
      const result = runBinary('xargs', ['echo']);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('not in the allowlist');
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('blocks arbitrary binaries', () => {
      const result = runBinary('rm', ['-rf', '/']);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('not in the allowlist');
      expect(spawnSync).not.toHaveBeenCalled();
    });
  });

  describe('stdout/stderr handling', () => {
    it('returns stdout correctly', () => {
      spawnSync.mockReturnValue({
        stdout: 'command output',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('echo', ['hello']);

      expect(result.stdout).toBe('command output');
      expect(result.stderr).toBe('');
    });

    it('returns stderr correctly', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: 'error message',
        status: 1,
        error: null,
      });

      const result = runBinary('curl', ['https://invalid.example']);

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('error message');
    });

    it('returns both stdout and stderr', () => {
      spawnSync.mockReturnValue({
        stdout: 'normal output',
        stderr: 'warning message',
        status: 0,
        error: null,
      });

      const result = runBinary('kubectl', ['apply', '-f', 'config.yaml']);

      expect(result.stdout).toBe('normal output');
      expect(result.stderr).toBe('warning message');
    });

    it('handles null stdout/stderr', () => {
      spawnSync.mockReturnValue({
        stdout: null,
        stderr: null,
        status: 0,
        error: null,
      });

      const result = runBinary('kubectl', ['version']);

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });
  });

  describe('exit code handling', () => {
    it('returns exit code 0 on success', () => {
      spawnSync.mockReturnValue({
        stdout: 'success',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('kubectl', ['version']);

      expect(result.exitCode).toBe(0);
    });

    it('returns non-zero exit code on failure', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: 'command failed',
        status: 127,
        error: null,
      });

      const result = runBinary('kubectl', ['invalid-command']);

      expect(result.exitCode).toBe(127);
    });

    it('returns exit code 1 when status is null but error exists', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: null,
        error: new Error('ENOENT'),
      });

      const result = runBinary('kubectl', ['get', 'pods']);

      expect(result.exitCode).toBe(1);
    });

    it('returns exit code 0 when status is null and no error', () => {
      spawnSync.mockReturnValue({
        stdout: 'output',
        stderr: '',
        status: null,
        error: null,
      });

      const result = runBinary('echo', ['test']);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('error handling', () => {
    it('handles command not found error', () => {
      const mockError = new Error('spawn kubectl ENOENT');
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: null,
        error: mockError,
      });

      const result = runBinary('kubectl', ['version']);

      expect(result.error).toBe('spawn kubectl ENOENT');
      expect(result.exitCode).toBe(1);
    });

    it('handles timeout error', () => {
      const mockError = new Error('timeout exceeded');
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: null,
        error: mockError,
      });

      const result = runBinary('curl', ['https://slow.example.com']);

      expect(result.error).toBe('timeout exceeded');
    });

    it('returns null error on success', () => {
      spawnSync.mockReturnValue({
        stdout: 'success',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('kubectl', ['version']);

      expect(result.error).toBeNull();
    });
  });

  describe('argument sanitization', () => {
    it('sanitizes all arguments before execution', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        error: null,
      });

      runBinary('kubectl', ['get', 'pods', '--namespace', 'default']);

      expect(spawnSync).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'pods', '--namespace', 'default'],
        expect.anything()
      );
    });

    it('throws on dangerous argument', () => {
      expect(() => {
        runBinary('kubectl', ['get', 'pods; rm -rf /']);
      }).toThrow('Failed to sanitize argument');
    });

    it('throws on command substitution in argument', () => {
      expect(() => {
        runBinary('echo', ['$(whoami)']);
      }).toThrow('Failed to sanitize argument');
    });

    it('throws on injection attempt', () => {
      expect(() => {
        runBinary('kubectl', ['get', 'pods', '| cat /etc/passwd']);
      }).toThrow('Failed to sanitize argument');
    });
  });

  describe('shell: false enforcement', () => {
    it('always passes shell: false to spawnSync', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        error: null,
      });

      runBinary('kubectl', ['get', 'pods']);

      expect(spawnSync).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'pods'],
        expect.objectContaining({ shell: false })
      );
    });

    it('does not allow shell: true to be overridden', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        error: null,
      });

      // Try to override with shell: true (should be ignored)
      runBinary('kubectl', ['get', 'pods'], { shell: true });

      // shell: false should still be enforced (later value wins in spread)
      expect(spawnSync).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'pods'],
        expect.objectContaining({ shell: false })
      );
    });
  });

  describe('timeout handling', () => {
    it('accepts timeout option', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        error: null,
      });

      runBinary('curl', ['https://example.com'], { timeout: 5000 });

      expect(spawnSync).toHaveBeenCalledWith(
        'curl',
        ['https://example.com'],
        expect.objectContaining({
          timeout: 5000,
          shell: false,
        })
      );
    });

    it('handles timeout exceeded', () => {
      const timeoutError = new Error('timeout exceeded');
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: null,
        error: timeoutError,
      });

      const result = runBinary('curl', ['https://slow.example.com'], { timeout: 1000 });

      expect(result.error).toBe('timeout exceeded');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty arguments array', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('pwd', []);

      expect(result.exitCode).toBe(0);
      expect(spawnSync).toHaveBeenCalledWith('pwd', [], expect.anything());
    });

    it('handles undefined arguments (defaults to empty array)', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('pwd');

      expect(result.exitCode).toBe(0);
      expect(spawnSync).toHaveBeenCalledWith('pwd', [], expect.anything());
    });

    it('handles undefined options (defaults to empty object)', () => {
      spawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        error: null,
      });

      const result = runBinary('echo', ['test']);

      expect(result.exitCode).toBe(0);
      expect(spawnSync).toHaveBeenCalledWith(
        'echo',
        ['test'],
        expect.objectContaining({ shell: false, encoding: 'utf8' })
      );
    });
  });
});

// ── ALLOWED_BASE_COMMANDS Tests ────────────────────────────────────────────

describe('ALLOWED_BASE_COMMANDS verification', () => {
  it('includes core kubectl command', () => {
    spawnSync.mockReturnValue({ stdout: '', stderr: '', status: 0, error: null });
    const result = runBinary('kubectl', ['version']);
    expect(result.error).toBeNull();
  });

  it('includes helm command', () => {
    spawnSync.mockReturnValue({ stdout: '', stderr: '', status: 0, error: null });
    const result = runBinary('helm', ['version']);
    expect(result.error).toBeNull();
  });

  it('excludes awk', () => {
    const result = runBinary('awk', ['{print $1}']);
    expect(result.error).toContain('not in the allowlist');
  });

  it('excludes sed', () => {
    const result = runBinary('sed', ['s/a/b/']);
    expect(result.error).toContain('not in the allowlist');
  });

  it('excludes find', () => {
    const result = runBinary('find', ['.', '-name', '*.txt']);
    expect(result.error).toContain('not in the allowlist');
  });

  it('excludes xargs', () => {
    const result = runBinary('xargs', ['echo']);
    expect(result.error).toContain('not in the allowlist');
  });
});
