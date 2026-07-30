#!/usr/bin/env node
// Generates web/src/types/rewards.generated.ts from pkg/rewards/tiers.go.
//
// Phase 1 of RFC #8862 makes Go the canonical source for contributor rank
// tiers. This script parses the Go source with a regex-based extractor (no
// AST libs, no toolchain beyond Node itself) and emits a TypeScript file
// with the same tier data plus a re-export of the current-tier lookup.
//
// Usage:
//   node scripts/gen-rewards-types.mjs              # write generated file
//   node scripts/gen-rewards-types.mjs --check      # exit 1 if out of sync
//
// The --check mode is what CI calls: it runs the generator into a temp
// buffer and compares against the committed file. Any drift fails the job
// so the TS and Go sides cannot silently disagree.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const GO_SOURCE = resolve(REPO_ROOT, 'pkg/rewards/tiers.go')
const TS_OUTPUT = resolve(REPO_ROOT, 'web/src/types/rewards.generated.ts')

// Markers that bracket the tier slice in the Go source. Keeping these as
// constants instead of inline literals keeps the parser easy to retarget
// if the Go file is ever reshuffled.
const SLICE_START_MARKER = 'var ContributorLevels = []Tier{'
const SLICE_END_MARKER = '\n}\n'

/** Fields that appear on every Tier struct literal, in declaration order. */
const TIER_FIELDS = [
  { go: 'Rank', ts: 'rank', kind: 'number' },
  { go: 'Name', ts: 'name', kind: 'string' },
  { go: 'Icon', ts: 'icon', kind: 'string' },
  { go: 'IconPath', ts: 'iconPath', kind: 'string' },
  { go: 'MinCoins', ts: 'minCoins', kind: 'number' },
  { go: 'Color', ts: 'color', kind: 'string' },
  { go: 'BgClass', ts: 'bgClass', kind: 'string' },
  { go: 'TextClass', ts: 'textClass', kind: 'string' },
  { go: 'BorderClass', ts: 'borderClass', kind: 'string' },
]

/**
 * Extract the ContributorLevels slice body (everything between the opening
 * `{` of the literal and the closing `}` on its own line).
 */
function extractSliceBody(goSource) {
  const startIdx = goSource.indexOf(SLICE_START_MARKER)
  if (startIdx === -1) {
    throw new Error(
      `Could not find '${SLICE_START_MARKER}' in ${GO_SOURCE}. ` +
      `The Go source may have been restructured; update SLICE_START_MARKER.`,
    )
  }
  const afterStart = startIdx + SLICE_START_MARKER.length
  const endIdx = goSource.indexOf(SLICE_END_MARKER, afterStart)
  if (endIdx === -1) {
    throw new Error(
      `Could not find end of ContributorLevels slice (looked for '\\n}\\n' after start).`,
    )
  }
  return goSource.slice(afterStart, endIdx)
}

/**
 * Extract shared constants from Go (PointsBugIssue, PointsPROpened, etc.).
 */
function extractScoringConstants(goSource) {
  const constants = []
  const regex = /Points([a-zA-Z]+)\s*=\s*(\d+)/g
  let match
  while ((match = regex.exec(goSource)) !== null) {
    constants.push({ name: match[1], value: Number.parseInt(match[2], 10) })
  }
  return constants
}

/**
 * Split the slice body into individual struct literals. Each element is a
 * balanced `{ ... }` block separated by `,`. A small bracket-depth counter
 * handles this without pulling in a real parser.
 */
function splitStructLiterals(sliceBody) {
  const literals = []
  let depth = 0
  let current = ''
  for (const ch of sliceBody) {
    if (ch === '{') {
      depth++
      if (depth === 1) {
        current = ''
        continue
      }
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        literals.push(current)
        current = ''
        continue
      }
    }
    if (depth >= 1) current += ch
  }
  return literals
}

/**
 * Parse a single struct literal body into a { ts-field: value } object.
 * Field values are either bare integers or double-quoted strings (matching
 * what the Go source uses); anything else is a parser error and we fail
 * loudly rather than emit garbage TS.
 */
function parseStructLiteral(body) {
  const out = {}
  for (const field of TIER_FIELDS) {
    // Match `FieldName: <value>,` allowing any whitespace. Quoted string
    // or bare int are the only value shapes we emit, so we accept both.
    const regex = new RegExp(
      `${field.go}\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|(-?\\d+))\\s*,`,
    )
    const match = body.match(regex)
    if (!match) {
      throw new Error(
        `Field ${field.go} not found in tier literal; body was:\n${body.trim()}`,
      )
    }
    if (field.kind === 'string') {
      if (match[1] === undefined) {
        throw new Error(`Field ${field.go} expected string literal, got number`)
      }
      out[field.ts] = match[1]
    } else {
      if (match[2] === undefined) {
        throw new Error(`Field ${field.go} expected integer literal, got string`)
      }
      out[field.ts] = Number.parseInt(match[2], 10)
    }
  }
  return out
}

/** Render a single tier object as a TS object literal. */
function renderTier(tier) {
  const parts = TIER_FIELDS.map((field) => {
    const value = tier[field.ts]
    const rendered =
      field.kind === 'string'
        ? JSON.stringify(value) // handles escaping of quotes/backslashes
        : String(value)
    return `    ${field.ts}: ${rendered},`
  })
  return `  {\n${parts.join('\n')}\n  }`
}

/** Render the full generated TS file. */
function renderFile(tiers, constants) {
  const header = [
    '// Code generated by scripts/gen-rewards-types.mjs — DO NOT EDIT.',
    '//',
    '// Source of truth: pkg/rewards/tiers.go',
    '// Regenerate with: node scripts/gen-rewards-types.mjs',
    '//',
    '// Phase 1 of RFC #8862 moved the canonical contributor-ladder',
    '// definition to Go. The CI drift check at',
    '// .github/workflows/rewards-types-drift.yml re-runs the generator and',
    '// fails the build if this file does not match the Go source.',
    '',
    "import type { ContributorLevel } from './rewards'",
    '',
  ].join('\n')

  const body = `export const CONTRIBUTOR_LEVELS_GENERATED: ContributorLevel[] = [\n${tiers
    .map(renderTier)
    .join(',\n')},\n]\n`

  const footer = `\n/** Point values for GitHub contributions (#8862 Phase 4). */\nexport const GITHUB_SCORING_GENERATED = {\n${constants
    .map((c) => `  ${c.name}: ${c.value},`)
    .join('\n')}\n} as const\n`

  return `${header}\n${body}${footer}`
}

function generate() {
  const goSource = readFileSync(GO_SOURCE, 'utf8')
  const sliceBody = extractSliceBody(goSource)
  const literals = splitStructLiterals(sliceBody)
  if (literals.length === 0) {
    throw new Error('Parsed 0 tiers from ContributorLevels — refusing to emit empty file')
  }
  const tiers = literals.map(parseStructLiteral)
  const constants = extractScoringConstants(goSource)
  return renderFile(tiers, constants)
}

function main() {
  const checkMode = process.argv.includes('--check')
  const generated = generate()

  if (checkMode) {
    let existing = ''
    try {
      existing = readFileSync(TS_OUTPUT, 'utf8')
    } catch {
      // Fall through: empty string will never match a non-empty generated
      // file, so the mismatch block below reports the problem for us.
    }
    if (existing !== generated) {
      process.stderr.write(
        `drift detected: ${TS_OUTPUT} is out of sync with ${GO_SOURCE}\n` +
        `Run: node scripts/gen-rewards-types.mjs\n`,
      )
      process.exit(1)
    }
    process.stdout.write(`OK: ${TS_OUTPUT} matches ${GO_SOURCE}\n`)
    return
  }

  writeFileSync(TS_OUTPUT, generated)
  process.stdout.write(`wrote ${TS_OUTPUT}\n`)
}

main()
