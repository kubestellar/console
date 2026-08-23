// @vitest-environment node
/**
 * Unit tests for scripts/lib/outreach-helpers.mjs
 *
 * Related: Issue #3003
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  slugify,
  titleCase,
  generateIssueTitle,
  generateIssueBody,
  generateIssueLabels,
} from '../../lib/outreach-helpers.mjs';

// ── slugify ──────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases the input', () => {
    expect(slugify('Argo')).toBe('argo');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('Open Policy Agent')).toBe('open-policy-agent');
  });

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(slugify('cert-manager!')).toBe('cert-manager');
  });

  it('collapses multiple non-alphanumeric chars into one hyphen', () => {
    expect(slugify('flux   cd')).toBe('flux-cd');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  kyverno  ')).toBe('kyverno');
  });

  it('handles already-slugified input unchanged', () => {
    expect(slugify('cert-manager')).toBe('cert-manager');
  });
});

// ── titleCase ────────────────────────────────────────────────────────────────

describe('titleCase', () => {
  it('capitalises a single word', () => {
    expect(titleCase('argo')).toBe('Argo');
  });

  it('capitalises each hyphen-separated token', () => {
    expect(titleCase('open-policy-agent')).toBe('Open Policy Agent');
  });

  it('handles already-capitalised input', () => {
    expect(titleCase('Argo')).toBe('Argo');
  });

  it('does not alter inner-token casing', () => {
    expect(titleCase('flux-cd')).toBe('Flux Cd');
  });
});

// ── generateIssueTitle ───────────────────────────────────────────────────────

describe('generateIssueTitle', () => {
  it('starts with [install-mission] prefix', () => {
    expect(generateIssueTitle('argo')).toMatch(/^\[install-mission\]/);
  });

  it('contains the title-cased project name', () => {
    expect(generateIssueTitle('cert-manager')).toContain('Cert Manager');
  });

  it('slugifies raw project names before title-casing', () => {
    expect(generateIssueTitle('Open Policy Agent')).toContain('Open Policy Agent');
  });

  it('ends with "to KubeStellar console catalog"', () => {
    expect(generateIssueTitle('flux-cd')).toMatch(/to KubeStellar console catalog$/);
  });
});

// ── generateIssueBody ────────────────────────────────────────────────────────

describe('generateIssueBody', () => {
  const originalEnv = process.env.CONSOLE_URL;

  beforeEach(() => {
    delete process.env.CONSOLE_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONSOLE_URL = originalEnv;
    } else {
      delete process.env.CONSOLE_URL;
    }
  });

  it('contains the project slug', () => {
    const body = generateIssueBody('Argo CD');
    expect(body).toContain('argo-cd');
  });

  it('uses the default console URL when no override is given', () => {
    const body = generateIssueBody('argo');
    expect(body).toContain('https://console.kubestellar.io');
  });

  it('uses the consoleUrl parameter when provided', () => {
    const body = generateIssueBody('argo', 'https://staging.example.com');
    expect(body).toContain('https://staging.example.com');
    expect(body).not.toContain('https://console.kubestellar.io');
  });

  it('uses the CONSOLE_URL env variable as fallback', () => {
    process.env.CONSOLE_URL = 'https://env-override.example.com';
    const body = generateIssueBody('argo');
    expect(body).toContain('https://env-override.example.com');
  });

  it('URL-encodes the project slug in the improve link', () => {
    const body = generateIssueBody('my project');
    expect(body).toContain('project=my-project');
  });

  it('has a minimum meaningful length', () => {
    const body = generateIssueBody('argo');
    expect(body.length).toBeGreaterThan(200);
  });

  it('references the correct mission JSON path', () => {
    const body = generateIssueBody('cert-manager');
    expect(body).toContain('fixes/cncf-install/cert-manager.json');
  });
});

// ── generateIssueLabels ───────────────────────────────────────────────────────

describe('generateIssueLabels', () => {
  it('returns an array', () => {
    expect(Array.isArray(generateIssueLabels())).toBe(true);
  });

  it('includes "cncf-outreach" label', () => {
    expect(generateIssueLabels()).toContain('cncf-outreach');
  });

  it('includes "help wanted" label', () => {
    expect(generateIssueLabels()).toContain('help wanted');
  });

  it('returns a fresh array each call (no shared reference)', () => {
    const a = generateIssueLabels();
    const b = generateIssueLabels();
    a.push('extra');
    expect(b).not.toContain('extra');
  });
});
