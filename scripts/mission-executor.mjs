#!/usr/bin/env node
/**
 * mission-executor.mjs
 * Secure command execution utilities for mission workflows
 */

import { spawnSync } from 'child_process';

// Allowlisted binaries that can be executed
const ALLOWED_BASE_COMMANDS = new Set([
  'kubectl',
  'helm',
  'git',
  'docker',
  'curl',
  'jq',
  'grep',
  'cat',
  'echo',
  'ls',
  'pwd',
  'date',
]);

/**
 * Sanitize command-line argument to prevent injection attacks.
 * Rejects arguments containing control characters or shell metacharacters.
 *
 * @param {string} arg - The argument to sanitize
 * @returns {string} The sanitized argument
 * @throws {Error} If argument contains dangerous characters
 */
export function sanitizeArg(arg) {
  if (typeof arg !== 'string') {
    throw new Error('Argument must be a string');
  }

  // Check for null bytes
  if (arg.includes('\0')) {
    throw new Error('Argument contains null byte');
  }

  // Check for carriage return and newline
  if (arg.includes('\r') || arg.includes('\n')) {
    throw new Error('Argument contains control characters');
  }

  // Check for shell metacharacters
  const dangerousChars = ['$', '`', '|', '>', '<', '&', ';'];
  for (const char of dangerousChars) {
    if (arg.includes(char)) {
      throw new Error(`Argument contains dangerous character: ${char}`);
    }
  }

  // Check for command substitution patterns
  if (arg.includes('$(')) {
    throw new Error('Argument contains command substitution pattern');
  }

  return arg;
}

/**
 * Execute an allowlisted binary with sanitized arguments.
 * Uses spawnSync with shell: false to prevent command injection.
 *
 * @param {string} binary - The binary to execute (must be in ALLOWED_BASE_COMMANDS)
 * @param {string[]} cmdArgs - Array of command arguments
 * @param {object} opts - spawn options (optional)
 * @returns {object} Result object with { stdout, stderr, exitCode, error }
 */
export function runBinary(binary, cmdArgs = [], opts = {}) {
  // Validate binary is allowlisted
  if (!ALLOWED_BASE_COMMANDS.has(binary)) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: `Binary '${binary}' is not in the allowlist`,
    };
  }

  // Sanitize all arguments
  const sanitizedArgs = cmdArgs.map(arg => {
    try {
      return sanitizeArg(arg);
    } catch (err) {
      throw new Error(`Failed to sanitize argument: ${err.message}`);
    }
  });

  // Execute with shell: false (security-critical)
  const result = spawnSync(binary, sanitizedArgs, {
    encoding: 'utf8',
    shell: false, // CRITICAL: prevents shell interpretation
    ...opts,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status !== null ? result.status : (result.error ? 1 : 0),
    error: result.error ? result.error.message : null,
  };
}
