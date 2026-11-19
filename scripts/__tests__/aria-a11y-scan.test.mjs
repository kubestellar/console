// @vitest-environment node
/**
 * Unit tests for scripts/aria-a11y-scan.mjs.
 *
 * The accessibility focus scan previously used line-oriented grep, so
 * multiline aria-label and alt attributes were reported as missing.
 */
import { describe, expect, it } from 'vitest';
import { FINDING_KIND, formatFindings, scanSource } from '../aria-a11y-scan.mjs';

const kinds = findings => findings.map(f => f.kind);

describe('scanSource — multiline attributes', () => {
  it('does not flag a button whose aria-label is on a later line', () => {
    const findings = scanSource(`
      <button
        type="button"
        aria-label="Close"
      >
        <X />
      </button>
    `, 'Example.tsx');

    expect(findings).toEqual([]);
  });

  it('does not flag an image whose alt attribute is on a later line', () => {
    const findings = scanSource(`
      <img
        src={logoUrl}
        alt="Project logo"
      />
    `, 'Example.tsx');

    expect(findings).toEqual([]);
  });

  it('does not flag a button with visible text content', () => {
    expect(scanSource('<button>Save changes</button>', 'Example.tsx')).toEqual([]);
  });

  it('does not flag a button whose text comes from a JSX expression', () => {
    expect(scanSource("<button>{t('common.save')}</button>", 'Example.tsx')).toEqual([]);
  });
});

describe('scanSource — true positives', () => {
  it('flags an icon-only button without an accessible name', () => {
    const findings = scanSource('<button type="button"><X /></button>', 'Example.tsx');

    expect(kinds(findings)).toEqual([FINDING_KIND.BUTTON_NAME]);
    expect(findings[0].line).toBe(1);
  });

  it('accepts title as the accessible name fallback', () => {
    expect(scanSource('<button title="Close"><X /></button>', 'Example.tsx')).toEqual([]);
  });

  it('accepts aria-labelledby as an accessible name', () => {
    expect(scanSource('<button aria-labelledby="close-label"><X /></button>', 'Example.tsx')).toEqual([]);
  });

  it('flags an image without alt text', () => {
    const findings = scanSource('<img src={logoUrl} />', 'Example.tsx');

    expect(kinds(findings)).toEqual([FINDING_KIND.IMAGE_ALT]);
  });

  it('ignores aria-hidden controls and images', () => {
    expect(scanSource(`
      <button aria-hidden="true"><X /></button>
      <img aria-hidden="true" src={decorative} />
    `, 'Example.tsx')).toEqual([]);
  });
});

describe('formatFindings', () => {
  it('groups findings by accessibility rule', () => {
    const findings = scanSource('<button><X /></button><img src={logoUrl} />', 'Example.tsx');
    const output = formatFindings(findings);

    expect(output).toContain('### Buttons missing an accessible name');
    expect(output).toContain('### Images without alt text');
  });
});
