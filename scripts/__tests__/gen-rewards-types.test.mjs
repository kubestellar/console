// @vitest-environment node
/**
 * Unit tests for scripts/gen-rewards-types.mjs
 *
 * Covers the pure Go-source parsers and TS renderers used by the RFC #8862
 * Phase 1 codegen (pkg/rewards/tiers.go -> web/src/types/rewards.generated.ts).
 *
 * The drift-check CLI (`node scripts/gen-rewards-types.mjs --check`) already
 * catches Go/TS divergence in CI (.github/workflows/rewards-types-drift.yml).
 * These tests catch a different failure mode: the generator itself silently
 * mis-parsing the Go source and producing plausible-but-wrong TS. Any change
 * to the parser regex or the split/render logic must not break these.
 */
import { describe, expect, it } from 'vitest';
import {
  extractSliceBody,
  extractScoringConstants,
  splitStructLiterals,
  parseStructLiteral,
  renderTier,
  renderFile,
} from '../gen-rewards-types.mjs';

// ── extractSliceBody ─────────────────────────────────────────────────────────

describe('extractSliceBody', () => {
  it('extracts everything between the ContributorLevels start marker and closing brace', () => {
    const src = [
      'package rewards',
      '',
      'var ContributorLevels = []Tier{',
      '\t{Rank: 1, Name: "Observer"},',
      '\t{Rank: 2, Name: "Explorer"},',
      '}',
      '',
    ].join('\n');
    const body = extractSliceBody(src);
    expect(body).toContain('Observer');
    expect(body).toContain('Explorer');
    // Trailing `\n}\n` sentinel is stripped off.
    expect(body.endsWith('}\n')).toBe(false);
  });

  it('throws with a descriptive error when the start marker is missing', () => {
    expect(() => extractSliceBody('package rewards\n')).toThrow(
      /Could not find 'var ContributorLevels = \[\]Tier\{'/,
    );
  });

  it('throws when the closing brace on its own line is missing', () => {
    // Start marker present but no `\n}\n` sentinel after it.
    const src = 'var ContributorLevels = []Tier{ some garbage without terminator';
    expect(() => extractSliceBody(src)).toThrow(/Could not find end of ContributorLevels slice/);
  });
});

// ── extractScoringConstants ──────────────────────────────────────────────────

describe('extractScoringConstants', () => {
  it('extracts every `Points<Name> = <int>` constant', () => {
    const src = `
      const (
        PointsBugIssue     = 300
        PointsFeatureIssue = 100
        PointsPRMerged     = 500
      )
    `;
    const constants = extractScoringConstants(src);
    expect(constants).toEqual([
      { name: 'BugIssue', value: 300 },
      { name: 'FeatureIssue', value: 100 },
      { name: 'PRMerged', value: 500 },
    ]);
  });

  it('returns an empty array when no matching constants are present', () => {
    expect(extractScoringConstants('package rewards\n')).toEqual([]);
  });

  it('parses numeric values as integers, not strings', () => {
    const constants = extractScoringConstants('PointsFoo = 42');
    expect(constants).toHaveLength(1);
    expect(constants[0].value).toBe(42);
    expect(typeof constants[0].value).toBe('number');
  });
});

// ── splitStructLiterals ──────────────────────────────────────────────────────

describe('splitStructLiterals', () => {
  it('splits a well-formed slice body into individual struct-literal bodies', () => {
    // Depth-1 body is the contents between (not including) the outer braces.
    const body = `
      {Rank: 1, Name: "Observer"},
      {Rank: 2, Name: "Explorer"},
    `;
    const literals = splitStructLiterals(body);
    expect(literals).toHaveLength(2);
    expect(literals[0]).toContain('Observer');
    expect(literals[1]).toContain('Explorer');
  });

  it('returns an empty array for a body with no struct literals', () => {
    expect(splitStructLiterals('')).toEqual([]);
    expect(splitStructLiterals('   \n   ')).toEqual([]);
  });

  it('does not double-emit when depth drops in and out multiple times', () => {
    // Three top-level literals — each parsed exactly once.
    const body = '{a},{b},{c}';
    expect(splitStructLiterals(body)).toEqual(['a', 'b', 'c']);
  });
});

// ── parseStructLiteral ───────────────────────────────────────────────────────

describe('parseStructLiteral', () => {
  const validBody = `
    Rank:        1,
    Name:        "Observer",
    Icon:        "Telescope",
    IconPath:    "m19 11-8-8",
    MinCoins:    0,
    Color:       "gray",
    BgClass:     "bg-gray-500/20",
    TextClass:   "text-muted-foreground",
    BorderClass: "border-gray-500/30",
  `;

  it('parses a well-formed tier literal into a ts-field-keyed object', () => {
    expect(parseStructLiteral(validBody)).toEqual({
      rank: 1,
      name: 'Observer',
      icon: 'Telescope',
      iconPath: 'm19 11-8-8',
      minCoins: 0,
      color: 'gray',
      bgClass: 'bg-gray-500/20',
      textClass: 'text-muted-foreground',
      borderClass: 'border-gray-500/30',
    });
  });

  it('handles escaped double quotes inside a string field', () => {
    const body = validBody.replace('"Observer"', '"Obs \\"quoted\\" erver"');
    const parsed = parseStructLiteral(body);
    // Escape sequences are preserved verbatim — JSON.stringify at render time
    // re-escapes them, so the generator round-trips faithfully.
    expect(parsed.name).toBe('Obs \\"quoted\\" erver');
  });

  it('throws when a required field is missing entirely', () => {
    const missingRank = validBody.replace(/Rank:\s*1,\n/, '');
    expect(() => parseStructLiteral(missingRank)).toThrow(/Field Rank not found/);
  });

  it('throws when a string field carries an int literal', () => {
    // Swap Name's quoted string for a bare integer to trip the string/int
    // discriminator in the parser.
    const bad = validBody.replace('"Observer"', '42');
    expect(() => parseStructLiteral(bad)).toThrow(/Field Name expected string literal, got number/);
  });

  it('throws when an int field carries a quoted string', () => {
    const bad = validBody.replace('Rank:        1,', 'Rank:        "1",');
    expect(() => parseStructLiteral(bad)).toThrow(/Field Rank expected integer literal, got string/);
  });

  it('parses negative integer values', () => {
    const negative = validBody.replace('MinCoins:    0,', 'MinCoins:    -5,');
    expect(parseStructLiteral(negative).minCoins).toBe(-5);
  });
});

// ── renderTier ───────────────────────────────────────────────────────────────

describe('renderTier', () => {
  const tier = {
    rank: 1,
    name: 'Observer',
    icon: 'Telescope',
    iconPath: 'm19 11',
    minCoins: 0,
    color: 'gray',
    bgClass: 'bg-gray-500/20',
    textClass: 'text-muted-foreground',
    borderClass: 'border-gray-500/30',
  };

  it('renders every field with the expected TS-object-literal shape', () => {
    const out = renderTier(tier);
    expect(out).toContain('rank: 1,');
    expect(out).toContain('name: "Observer",');
    expect(out).toContain('minCoins: 0,');
    expect(out).toContain('borderClass: "border-gray-500/30",');
    // 4-space indent inside the object; opening/closing braces at 2-space
    // (matches the existing checked-in generated file).
    expect(out.startsWith('  {\n')).toBe(true);
    expect(out.endsWith('\n  }')).toBe(true);
  });

  it('JSON-escapes special characters in string fields', () => {
    const withQuote = { ...tier, name: 'a"b' };
    const out = renderTier(withQuote);
    // The literal " must appear as \" so the emitted TS parses.
    expect(out).toContain('name: "a\\"b",');
  });

  it('renders numeric fields as bare numbers (no quotes)', () => {
    const out = renderTier({ ...tier, minCoins: 1500 });
    expect(out).toContain('minCoins: 1500,');
    expect(out).not.toContain('minCoins: "1500"');
  });
});

// ── renderFile ───────────────────────────────────────────────────────────────

describe('renderFile', () => {
  const tiers = [
    {
      rank: 1,
      name: 'Observer',
      icon: 'Telescope',
      iconPath: 'p',
      minCoins: 0,
      color: 'gray',
      bgClass: 'b',
      textClass: 't',
      borderClass: 'r',
    },
  ];
  const constants = [{ name: 'BugIssue', value: 300 }];

  it('starts with the DO-NOT-EDIT header comment', () => {
    const out = renderFile(tiers, constants);
    expect(out.startsWith('// Code generated by scripts/gen-rewards-types.mjs — DO NOT EDIT.')).toBe(true);
  });

  it('emits the ContributorLevel type import from ./rewards', () => {
    const out = renderFile(tiers, constants);
    expect(out).toContain("import type { ContributorLevel } from './rewards'");
  });

  it('emits the CONTRIBUTOR_LEVELS_GENERATED export with the tier list', () => {
    const out = renderFile(tiers, constants);
    expect(out).toContain('export const CONTRIBUTOR_LEVELS_GENERATED: ContributorLevel[] = [');
    expect(out).toContain('name: "Observer",');
  });

  it('emits the GITHUB_SCORING_GENERATED const with each Points* value', () => {
    const out = renderFile(tiers, constants);
    expect(out).toContain('export const GITHUB_SCORING_GENERATED = {');
    expect(out).toContain('BugIssue: 300,');
    expect(out).toContain('} as const');
  });

  it('emits with a stable, deterministic ordering (renders the same twice)', () => {
    // Guards against Map/Set iteration order regressions — if the codegen
    // ever became order-dependent, the drift check would flap silently.
    expect(renderFile(tiers, constants)).toBe(renderFile(tiers, constants));
  });
});
