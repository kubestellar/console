/**
 * Concurrent Mutation Safety — Static Scan (P2-B)
 *
 * Detects shared mutable state inside `settledWithConcurrency` and
 * `mapSettledWithConcurrency` callbacks.  Callbacks passed to these
 * helpers run concurrently; mutating a variable declared *outside*
 * the callback body (e.g. `.push()`, `[key] =`, `.set()`, `+=`)
 * is a data-race risk even though JS is single-threaded — interleaved
 * await points can cause lost writes or double-counting.
 *
 * The test uses a **ratcheting approach**: it counts current violations
 * and fails only if the count *increases*.  Fix violations to decrease
 * EXPECTED_MUTATION_COUNT over time.
 *
 * Run:   npx vitest run src/test/concurrent-mutation-safety.test.ts
 * Watch: npx vitest src/test/concurrent-mutation-safety.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Named constants ─────────────────────────────────────────────────────────

/** Root of the frontend source tree */
const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/** The concurrency helper names we scan for */
const CONCURRENCY_FN_NAMES = [
  'settledWithConcurrency',
  'mapSettledWithConcurrency',
] as const

/**
 * Patterns that indicate mutation of an outer-scope variable inside a
 * callback.  Each entry is a human-readable label + RegExp.
 *
 * We intentionally only flag mutations on identifiers that are *not*
 * locally declared inside the callback (the check inspects the callback
 * body, not the outer scope, so we flag any mutation that references a
 * name not const/let/var-declared in the callback).
 */
const MUTATION_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  /** Array.push / Array.unshift — appending to a shared accumulator */
  { label: '.push(', pattern: /\b(\w+)\.push\s*\(/ },
  /** Object bracket assignment — e.g. results[key] = value (but not type annotations) */
  { label: '[key] =', pattern: /^\s*(\w+)\[.+?\]\s*=\s*/ },
  /** Map.set — e.g. map.set(key, value) */
  { label: '.set(', pattern: /\b(\w+)\.set\s*\(/ },
  /** Compound assignment on object properties — e.g. aggregated.total += 1 */
  { label: '+=', pattern: /\b(\w+)\.\w+\s*(?:\+|-|\*|\/|%)=\s*/ },
  /** Postfix / prefix increment/decrement — e.g. count++, ++count */
  { label: '++/--', pattern: /(?:^\s*(\w+)\+\+|\+\+(\w+)|^\s*(\w+)--|-{2}(\w+))/ },
  /** Direct variable compound assignment — e.g. failedCount += 1 */
  { label: 'var +=', pattern: /^\s*(\w+)\s*(?:\+|-|\*|\/|%)=\s*/ },
]

/**
 * Identifiers that look like mutations but are safe to ignore.
 * React setState calls (set*) are filtered separately.
 */
const SAFE_MUTATION_IDENTIFIERS = new Set([
  'this',     // instance context
  'console',  // console.set... unlikely but safe
  'params',   // URLSearchParams.set is constructing a request, not shared state
  'headers',  // Headers.set is constructing a request
])

/**
 * Ratchet baseline: current number of files that contain at least one
 * outer-scope mutation inside a concurrency callback.
 *
 * This number MUST ONLY DECREASE.  If you fix a file, lower the count.
 * If this test fails because the count *dropped*, congratulations — just
 * update the constant.  If it fails because the count *increased*, you
 * introduced a new shared mutation — refactor to return values instead.
 */
const EXPECTED_MUTATION_COUNT = 10

/**
 * Known files with shared-mutation violations.
 * Keyed by path relative to SRC_DIR (POSIX separators).
 * This list MUST ONLY SHRINK — never add new entries.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  'hooks/useCachedData.ts': [
    'accumulated.push(...tagged)',
    'failedCount++',
  ],
  'hooks/useKyverno.ts': [
    'allStatuses[cluster] = status',
  ],
  'hooks/useTrivy.ts': [
    'allStatuses[cluster] = status',
  ],
  'hooks/useKubescape.ts': [
    'allStatuses[cluster] = status',
  ],
  'hooks/useTrestle.ts': [
    'allStatuses[cluster] = status',
  ],
  'hooks/useRBACFindings.ts': [
    'allFindings[cluster] = findings',
  ],
  'hooks/useDataCompliance.ts': [
    'aggregated.totalSecrets += data.secrets.total',
  ],
  'hooks/useCachedLLMd.ts': [
    'accumulated.push(...tagged)',
  ],
  'contexts/AlertsContext.tsx': [
    'results[cluster.name] = data.results',
  ],
  'hooks/useCachedISO27001.ts': [
    'findings.push(...clusterFindings)',
  ],
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively find all .ts/.tsx source files under a directory */
function findSourceFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules, __tests__ (unit tests for the module itself),
      // and this test directory
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      results.push(...findSourceFiles(fullPath))
    } else if (
      /\.(tsx?)$/.test(entry.name) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      results.push(fullPath)
    }
  }
  return results
}

/** Get relative path from SRC_DIR with POSIX separators */
function relPath(filePath: string): string {
  return path.relative(SRC_DIR, filePath).replace(/\\/g, '/')
}

/**
 * Extract text inside balanced braces starting at position `start`.
 * Replicates the pattern from card-loading-standard.test.ts.
 */
function extractBalancedBraces(src: string, start: number): string | null {
  if (src[start] !== '{') return null

  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    if (depth === 0) {
      return src.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Extract text inside balanced parens starting at position `start`.
 */
function extractBalancedParens(src: string, start: number): string | null {
  if (src[start] !== '(') return null

  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') depth--
    if (depth === 0) {
      return src.slice(start, i + 1)
    }
  }
  return null
}

interface CallSite {
  fnName: string
  callbackBody: string
  lineNumber: number
}

/**
 * Find all arrow function bodies (`=> { ... }`) within a string.
 * Returns the outermost bodies only.
 */
function extractArrowBodies(src: string): string[] {
  const bodies: string[] = []
  const arrowPattern = /=>\s*\{/g
  let match: RegExpExecArray | null

  while ((match = arrowPattern.exec(src)) !== null) {
    const braceStart = src.indexOf('{', match.index + 2)
    if (braceStart === -1) continue
    const body = extractBalancedBraces(src, braceStart)
    if (body) {
      bodies.push(body)
      // Skip past this body to avoid nested matches
      arrowPattern.lastIndex = braceStart + body.length
    }
  }

  return bodies
}

/**
 * Given a source string, find all call sites of settledWithConcurrency or
 * mapSettledWithConcurrency and extract the callback bodies.
 *
 * Handles two patterns:
 *   1. Inline: settledWithConcurrency(items.map(x => async () => { ... }))
 *      or: mapSettledWithConcurrency(items, async (x) => { ... })
 *   2. Variable: const tasks = items.map(x => async () => { ... })
 *      followed by: settledWithConcurrency(tasks)
 */
function extractConcurrencyCallbacks(src: string): CallSite[] {
  const callSites: CallSite[] = []

  for (const fnName of CONCURRENCY_FN_NAMES) {
    const callPattern = new RegExp(`\\b${fnName}\\s*\\(`, 'g')
    let match: RegExpExecArray | null

    while ((match = callPattern.exec(src)) !== null) {
      const openParenIdx = match.index + match[0].length - 1
      const fullCall = extractBalancedParens(src, openParenIdx)
      if (!fullCall) continue

      const lineNumber = src.slice(0, match.index).split('\n').length

      // Check if the call contains inline arrow functions
      const inlineBodies = extractArrowBodies(fullCall)
      if (inlineBodies.length > 0) {
        // Inline pattern — extract bodies directly
        for (const body of inlineBodies) {
          callSites.push({ fnName, callbackBody: body, lineNumber })
        }
      } else {
        // Variable pattern — the argument is likely a variable name like `tasks`
        // Extract the variable name and find its declaration nearby
        const argMatch = fullCall.match(/^\(\s*(\w+)/)
        if (argMatch) {
          const varName = argMatch[1]
          const taskBodies = extractTasksVariable(src, varName, match.index)
          for (const body of taskBodies) {
            const taskLineNumber = src.slice(0, src.indexOf(body)).split('\n').length
            callSites.push({ fnName, callbackBody: body, lineNumber: taskLineNumber || lineNumber })
          }
        }
      }
    }
  }

  return callSites
}

/**
 * Given a variable name (e.g. `tasks`) and the position of the
 * settledWithConcurrency call, search backwards in the source for the
 * variable declaration and extract the arrow function bodies from it.
 *
 * Handles patterns like:
 *   const tasks = clusters.map(cluster => async () => { ... })
 *   const tasks = (clusters || []).map(cluster => async () => { ... })
 */
function extractTasksVariable(src: string, varName: string, callPos: number): string[] {
  // Search backwards from the call site for `const/let varName =`
  const beforeCall = src.slice(0, callPos)
  const declPattern = new RegExp(`(?:const|let)\\s+${varName}\\s*=`, 'g')
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null

  while ((m = declPattern.exec(beforeCall)) !== null) {
    lastMatch = m
  }

  if (!lastMatch) return []

  // From the declaration, find the value — it typically spans to a closing )
  // or to `await settledWithConcurrency`
  const declStart = lastMatch.index + lastMatch[0].length
  const declSrc = src.slice(declStart, callPos)

  // Extract arrow function bodies from the declaration
  return extractArrowBodies(declSrc)
}

/**
 * Collect identifiers declared with const/let/var inside the callback body.
 * These are LOCAL and should not be flagged as shared mutations.
 */
function getLocalDeclarations(callbackBody: string): Set<string> {
  const locals = new Set<string>()
  // Match const/let/var declarations — simple identifier
  const declPattern = /\b(?:const|let|var)\s+(\w+)/g
  let match: RegExpExecArray | null
  while ((match = declPattern.exec(callbackBody)) !== null) {
    locals.add(match[1])
  }
  // Match destructured declarations — e.g. const { a, b } = or const [x, y] =
  const destructObjPattern = /\b(?:const|let|var)\s+\{([^}]+)\}/g
  while ((match = destructObjPattern.exec(callbackBody)) !== null) {
    const names = match[1].split(',')
    for (const name of names) {
      // Handle renaming: `original: renamed` — we want the renamed identifier
      const parts = name.split(':')
      const id = (parts.length > 1 ? parts[1] : parts[0]).trim()
      if (id && /^\w+$/.test(id)) locals.add(id)
    }
  }
  // Also match function parameter names (arrow fn params)
  // e.g. `async (cluster) => { ... }` or `(item, index) =>`
  const paramPattern = /(?:async\s+)?\(([^)]*)\)\s*=>/g
  while ((match = paramPattern.exec(callbackBody)) !== null) {
    const params = match[1].split(',')
    for (const param of params) {
      const name = param.trim().replace(/[:{].*/, '').trim()
      if (name && /^\w+$/.test(name)) locals.add(name)
    }
  }
  // Match for-of/for-in declarations — e.g. for (const x of arr)
  const forPattern = /for\s*\(\s*(?:const|let|var)\s+(\w+)/g
  while ((match = forPattern.exec(callbackBody)) !== null) {
    locals.add(match[1])
  }
  return locals
}

interface Violation {
  filePath: string
  relFilePath: string
  lineNumber: number
  mutationLabel: string
  matchedText: string
  mutatedIdentifier: string
}

/**
 * Check whether a line is a type annotation rather than runtime code.
 * Lines like `let ws: Workload['status'] = 'Running'` are type annotations,
 * not bracket assignments on a shared variable.
 */
function isTypeAnnotation(line: string): boolean {
  // Match patterns like `: SomeType[` which are type annotations
  return /:\s*\w+\s*\[/.test(line)
}

/**
 * Scan a file for shared mutations inside concurrency callbacks.
 * Returns an array of violations.
 */
function scanFileForMutations(filePath: string): Violation[] {
  const src = fs.readFileSync(filePath, 'utf-8')

  // Quick filter: skip files that don't import the concurrency helpers
  const importsConcurrency = CONCURRENCY_FN_NAMES.some(fn => src.includes(fn))
  if (!importsConcurrency) return []

  // Skip the definition file itself and test files
  const rel = relPath(filePath)
  if (rel.includes('lib/utils/concurrency.ts')) return []
  if (rel.includes('__tests__/')) return []

  const violations: Violation[] = []
  const callSites = extractConcurrencyCallbacks(src)

  for (const { callbackBody, lineNumber } of callSites) {
    const locals = getLocalDeclarations(callbackBody)

    for (const { label, pattern } of MUTATION_PATTERNS) {
      // Apply the pattern to each line of the callback body
      const lines = callbackBody.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Reset lastIndex for non-global patterns
        const m = pattern.exec(line)
        if (!m) continue

        // The captured group is the identifier being mutated
        const mutatedId = m[1] || m[2] || m[3] || m[4]
        if (!mutatedId) continue

        // Skip if the identifier is locally declared inside the callback
        if (locals.has(mutatedId)) continue

        // Skip React setState calls — they are safe (React batches them)
        if (/^set[A-Z]/.test(mutatedId)) continue

        // Skip known safe identifiers
        if (SAFE_MUTATION_IDENTIFIERS.has(mutatedId)) continue

        // Skip type annotations that look like bracket assignment
        if (label === '[key] =' && isTypeAnnotation(line)) continue

        // Skip lines that are clearly `const/let/var` declarations
        if (/^\s*(?:const|let|var)\s/.test(line)) continue

        // Dedupe: avoid reporting the same line with multiple pattern labels
        const alreadyReported = violations.some(
          v => v.relFilePath === rel && v.matchedText === line.trim()
        )
        if (alreadyReported) continue

        violations.push({
          filePath,
          relFilePath: rel,
          lineNumber: lineNumber + i,
          mutationLabel: label,
          matchedText: line.trim(),
          mutatedIdentifier: mutatedId,
        })
      }
    }
  }

  return violations
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Concurrent Mutation Safety Scan', () => {
  /** All source files that could contain concurrency call sites */
  const sourceFiles = findSourceFiles(SRC_DIR)

  /** Minimum number of source files we expect to find (sanity check) */
  const MIN_EXPECTED_SOURCE_FILES = 100

  /** All violations across the entire codebase */
  const allViolations: Violation[] = []

  /** Map of relative file path to its violations */
  const violationsByFile = new Map<string, Violation[]>()

  // Run the scan once eagerly so tests can reference the results
  for (const filePath of sourceFiles) {
    const fileViolations = scanFileForMutations(filePath)
    if (fileViolations.length > 0) {
      allViolations.push(...fileViolations)
      violationsByFile.set(relPath(filePath), fileViolations)
    }
  }

  it('should find source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(MIN_EXPECTED_SOURCE_FILES)
  })

  it('should find concurrency call sites in the codebase', () => {
    /** Minimum number of files we expect to import concurrency helpers */
    const MIN_EXPECTED_CONCURRENCY_FILES = 10
    const concurrencyFiles = sourceFiles.filter(f => {
      const src = fs.readFileSync(f, 'utf-8')
      return CONCURRENCY_FN_NAMES.some(fn => src.includes(fn))
    })
    expect(concurrencyFiles.length).toBeGreaterThanOrEqual(MIN_EXPECTED_CONCURRENCY_FILES)
  })

  describe('Shared mutation detection per file', () => {
    for (const [rel, fileViolations] of violationsByFile) {
      it(`${rel}: shared mutations inside concurrency callbacks`, () => {
        if (KNOWN_VIOLATIONS[rel]) return // grandfathered

        const report = (fileViolations || []).map(v =>
          `  L${v.lineNumber}: ${v.mutationLabel} on "${v.mutatedIdentifier}" — ${v.matchedText}`
        ).join('\n')

        expect.fail(
          `${rel}: found ${fileViolations.length} shared mutation(s) in concurrency callback(s):\n${report}\n\n` +
          `Mutations on variables declared outside settledWithConcurrency / mapSettledWithConcurrency ` +
          `callbacks risk interleaved writes across await points.\n` +
          `Fix: return values from callbacks and aggregate after the settled call.\n` +
          `If this is a known pre-existing violation, add it to KNOWN_VIOLATIONS.`
        )
      })
    }
  })

  describe('Ratchet: violation count must not grow', () => {
    it(`total files with violations must not exceed ${EXPECTED_MUTATION_COUNT}`, () => {
      const filesWithViolations = violationsByFile.size
      expect(
        filesWithViolations,
        `Expected at most ${EXPECTED_MUTATION_COUNT} files with shared mutations, ` +
        `but found ${filesWithViolations}. If you added a new violation, refactor ` +
        `to return values from the callback instead of mutating outer-scope variables.\n` +
        `Violating files:\n${Array.from(violationsByFile.keys()).join('\n')}`
      ).toBeLessThanOrEqual(EXPECTED_MUTATION_COUNT)
    })

    it('EXPECTED_MUTATION_COUNT must stay in sync with actual violations', () => {
      const filesWithViolations = violationsByFile.size
      if (filesWithViolations < EXPECTED_MUTATION_COUNT) {
        expect.fail(
          `Congratulations! Violation count dropped from ${EXPECTED_MUTATION_COUNT} to ${filesWithViolations}. ` +
          `Please update EXPECTED_MUTATION_COUNT to ${filesWithViolations} to ratchet down.`
        )
      }
    })

    it('KNOWN_VIOLATIONS entries must all correspond to actual violations', () => {
      const staleEntries: string[] = []
      for (const knownRel of Object.keys(KNOWN_VIOLATIONS)) {
        if (!violationsByFile.has(knownRel)) {
          staleEntries.push(knownRel)
        }
      }
      if (staleEntries.length > 0) {
        expect.fail(
          `The following KNOWN_VIOLATIONS entries no longer have violations — remove them:\n` +
          staleEntries.map(e => `  - ${e}`).join('\n')
        )
      }
    })
  })

  describe('Violation detail report', () => {
    it('prints all violations for diagnostic purposes', () => {
      if (allViolations.length === 0) return

      const report = (allViolations || []).map(v => {
        const known = KNOWN_VIOLATIONS[v.relFilePath] ? ' [KNOWN]' : ' [NEW]'
        return `  ${v.relFilePath}:${v.lineNumber} — ${v.mutationLabel} on "${v.mutatedIdentifier}"${known}`
      }).join('\n')

      // This test always passes — it just logs the report for visibility
      console.log(
        `\n──── Concurrent Mutation Report ────\n` +
        `Total violations: ${allViolations.length} across ${violationsByFile.size} files\n` +
        `Known: ${Object.keys(KNOWN_VIOLATIONS).length} files | ` +
        `Ratchet baseline: ${EXPECTED_MUTATION_COUNT}\n\n` +
        report +
        `\n────────────────────────────────────\n`
      )
    })
  })
})
