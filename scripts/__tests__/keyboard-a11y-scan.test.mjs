// @vitest-environment node
/**
 * Unit tests for scripts/keyboard-a11y-scan.mjs
 *
 * The Auto-QA a11y focus day used to grep line-by-line for `onClick=` and
 * `<div.*onClick`, which mis-attributed multi-line JSX attributes and blamed
 * wrapping <div>s for nested <button onClick> (kubestellar/console#23748).
 * These tests pin the tag-aware behaviour so the heuristics cannot regress.
 */
import { describe, expect, it } from 'vitest';
import { FINDING_KIND, findTagEnd, formatFindings, scanSource } from '../keyboard-a11y-scan.mjs';

const kinds = findings => findings.map(f => f.kind);

describe('findTagEnd', () => {
  it('skips arrow functions inside braces so `=>` does not close the tag', () => {
    const src = '<div onClick={() => go()} className="x">body</div>';
    const end = findTagEnd(src, '<div'.length);
    expect(src.slice(0, end)).toBe('<div onClick={() => go()} className="x">');
  });

  it('skips quoted attribute values containing >', () => {
    const src = '<div title="a > b" onClick={fn}>x</div>';
    const end = findTagEnd(src, '<div'.length);
    expect(src.slice(0, end)).toBe('<div title="a > b" onClick={fn}>');
  });

  it('handles nested braces and template literals in handlers', () => {
    const src = '<div onClick={() => { const s = `>${a}`; run({ s }) }}>x</div>';
    const end = findTagEnd(src, '<div'.length);
    expect(src.slice(end)).toBe('x</div>');
  });

  it('returns -1 when the tag never closes', () => {
    expect(findTagEnd('<div onClick={fn}', '<div'.length)).toBe(-1);
  });
});

describe('scanSource — false positives from #23748', () => {
  it('does not flag a native <button> whose onClick is on a later line', () => {
    const src = [
      '<button',
      "  onClick={() => onReset('add_missing')}",
      '  className="w-full"',
      '>',
      '  Add',
      '</button>',
    ].join('\n');
    expect(scanSource(src)).toEqual([]);
  });

  it('does not flag a <Button> component with multi-line attributes', () => {
    const src = ['<Button', '  variant="ghost"', '  size="sm"', '  onClick={() => setCollapsed(false)}', '/>'].join('\n');
    expect(scanSource(src)).toEqual([]);
  });

  it('does not flag *Button / *Link components', () => {
    expect(scanSource('<IconButton onClick={fn} />')).toEqual([]);
    expect(scanSource('<NavLink onClick={fn} to="/x" />')).toEqual([]);
  });

  it('does not blame a wrapping <div> for a nested <button onClick> on the same line', () => {
    const src = '<div className="flex gap-2"><button type="button" onClick={() => go()}>Go</button></div>';
    expect(scanSource(src)).toEqual([]);
  });

  it('honours an onKeyDown that lives on a different line from onClick', () => {
    const src = ['<div', '  role="button"', '  tabIndex={0}', '  onClick={onClose}', '  onKeyDown={handleKey}', '>'].join(
      '\n',
    );
    expect(scanSource(src)).toEqual([]);
  });

  it('skips aria-hidden="true" elements such as modal backdrops', () => {
    const src = '<div onClick={close} aria-hidden="true" className="fixed inset-0" />';
    expect(scanSource(src)).toEqual([]);
  });
});

describe('scanSource — true positives', () => {
  it('flags a clickable <div> without role/tabIndex and without a key handler as both kinds', () => {
    const src = ['<div', '  onClick={() => onDrillDown(cluster)}', '  className="cursor-pointer"', '>'].join('\n');
    const findings = scanSource(src, 'X.tsx');
    expect(kinds(findings).sort()).toEqual([FINDING_KIND.CLICK_NO_KEY, FINDING_KIND.DIV_NO_ROLE].sort());
    expect(findings[0]).toMatchObject({ file: 'X.tsx', line: 2, tag: 'div' });
    expect(findings[0].snippet).toBe('onClick={() => onDrillDown(cluster)}');
  });

  it('flags a <div role="button" tabIndex={0}> that still lacks a key handler as click-no-key only', () => {
    const src = '<div role="button" tabIndex={0} onClick={fn}>x</div>';
    expect(kinds(scanSource(src))).toEqual([FINDING_KIND.CLICK_NO_KEY]);
  });

  it('flags a <div onClick onKeyDown> without role/tabIndex as div-no-role only', () => {
    const src = '<div onClick={fn} onKeyDown={fn}>x</div>';
    expect(kinds(scanSource(src))).toEqual([FINDING_KIND.DIV_NO_ROLE]);
  });

  it('flags a non-button custom component with onClick but no key handler', () => {
    const src = '<Card onClick={open} title="x" />';
    const findings = scanSource(src);
    expect(kinds(findings)).toEqual([FINDING_KIND.CLICK_NO_KEY]);
    expect(findings[0].tag).toBe('Card');
  });

  it('reports the line of the onClick attribute, not of the tag start', () => {
    const src = ['<span', '  className="x"', '', '  onClick={fn}', '/>'].join('\n');
    expect(scanSource(src)[0].line).toBe(4);
  });

  it('scans multiple tags in one file independently', () => {
    const src = [
      '<button onClick={a}>ok</button>',
      '<div onClick={b}>bad</div>',
      '<div role="button" tabIndex={0} onClick={c} onKeyDown={c}>fine</div>',
    ].join('\n');
    const findings = scanSource(src);
    expect(findings.every(f => f.line === 2)).toBe(true);
    expect(findings).toHaveLength(2);
  });
});

describe('formatFindings', () => {
  it('renders each kind under its own heading and truncates to max', () => {
    const findings = [
      { kind: FINDING_KIND.CLICK_NO_KEY, file: 'a.tsx', line: 1, tag: 'div', snippet: 'onClick={x}' },
      { kind: FINDING_KIND.CLICK_NO_KEY, file: 'b.tsx', line: 2, tag: 'div', snippet: 'onClick={y}' },
      { kind: FINDING_KIND.DIV_NO_ROLE, file: 'a.tsx', line: 1, tag: 'div', snippet: 'onClick={x}' },
    ];
    const out = formatFindings(findings, 1);
    expect(out).toContain('### Click handlers without keyboard equivalents');
    expect(out).toContain('a.tsx:1: <div> onClick={x}');
    expect(out).toContain('... and 1 more');
    expect(out).toContain('### Clickable divs without role or tabIndex');
    expect(out).not.toContain('b.tsx:2');
  });

  it('returns an empty string when there are no findings', () => {
    expect(formatFindings([])).toBe('');
  });
});
