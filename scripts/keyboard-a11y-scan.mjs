#!/usr/bin/env node
/**
 * Keyboard-navigation gap scanner for the Auto-QA a11y focus day.
 *
 * Replaces the line-oriented grep heuristics that produced false positives
 * (kubestellar/console#23748): JSX attributes usually span several lines, so a
 * `grep -v "<button"` filter never saw the element an `onClick=` belonged to,
 * and `<div.*onClick` blamed a wrapping <div> for a nested <button onClick>.
 *
 * This scanner tokenises each opening JSX tag (brace- and quote-aware, so
 * `onClick={() => x()}` does not terminate the tag early) and evaluates the
 * whole attribute block:
 *
 *   - click-no-key: onClick on an element that is neither natively keyboard
 *     operable (<button>, <a>, <input>, ...) nor a *Button component, and has
 *     no onKeyDown/onKeyUp/onKeyPress handler.
 *   - div-no-role: onClick on a <div>/<span> without role= or tabIndex.
 *
 * Elements marked aria-hidden="true" (e.g. modal backdrops) are skipped since
 * they are intentionally hidden from assistive technology.
 *
 * Usage: node scripts/keyboard-a11y-scan.mjs [srcDir] [--max N] [--json]
 * Exit code is always 0; the workflow decides what to do with findings.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

/** Native elements that receive focus and fire onClick from Enter/Space. */
export const NATIVE_INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'option',
  'summary',
  'details',
])

/** Component name patterns that wrap a native <button>/<a>. */
const INTERACTIVE_COMPONENT_PATTERN = /(^|[a-z])(Button|Link)$/
const KEY_HANDLER_PATTERN = /\bonKey(Down|Up|Press)\s*=/
const CLICK_HANDLER_PATTERN = /\bonClick\s*=/
const ROLE_OR_TABINDEX_PATTERN = /\b(role|tabIndex)\s*=/
const ARIA_HIDDEN_PATTERN = /\baria-hidden\s*=\s*(\{?\s*["']?true["']?\s*\}?|\{true\})/
const GENERIC_CONTAINER_TAGS = new Set(['div', 'span'])
const TAG_START_PATTERN = /<([A-Za-z][A-Za-z0-9_.]*)(?=[\s/>])/g
const DEFAULT_MAX_FINDINGS = 15
const SKIP_FILE_PATTERN = /(\.test\.tsx$|\.spec\.tsx$|\/__tests__\/|\/node_modules\/)/

export const FINDING_KIND = Object.freeze({
  CLICK_NO_KEY: 'click-no-key',
  DIV_NO_ROLE: 'div-no-role',
})

/**
 * Return the index just past the `>` that closes the opening tag starting at
 * `start`, or -1 if the tag never closes. Skips over `{...}` expressions
 * (tracking nesting) and quoted strings so `=>` inside handlers is ignored.
 */
export function findTagEnd(source, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (depth > 0) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '"' || ch === "'" || ch === '`') quote = ch
      continue
    }
    if (ch === '{') depth = 1
    else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '>') return i + 1
  }
  return -1
}

function lineOf(source, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (source[i] === '\n') line++
  return line
}

function isNativelyInteractive(tag) {
  return NATIVE_INTERACTIVE_TAGS.has(tag) || INTERACTIVE_COMPONENT_PATTERN.test(tag)
}

/**
 * Scan one TSX source string. Returns an array of
 * `{ kind, file, line, tag, snippet }` findings.
 */
export function scanSource(source, file = '<stdin>') {
  const findings = []
  TAG_START_PATTERN.lastIndex = 0
  let match
  while ((match = TAG_START_PATTERN.exec(source)) !== null) {
    const tag = match[1]
    const attrsStart = match.index + match[0].length
    const end = findTagEnd(source, attrsStart)
    if (end === -1) break
    const attrs = source.slice(attrsStart, end - 1)
    TAG_START_PATTERN.lastIndex = end

    if (!CLICK_HANDLER_PATTERN.test(attrs)) continue
    if (ARIA_HIDDEN_PATTERN.test(attrs)) continue

    const clickIndex = attrsStart + attrs.search(CLICK_HANDLER_PATTERN)
    const line = lineOf(source, clickIndex)
    const snippet = source.split('\n')[line - 1].trim()

    if (isNativelyInteractive(tag)) continue

    if (GENERIC_CONTAINER_TAGS.has(tag) && !ROLE_OR_TABINDEX_PATTERN.test(attrs)) {
      findings.push({ kind: FINDING_KIND.DIV_NO_ROLE, file, line, tag, snippet })
    }
    if (!KEY_HANDLER_PATTERN.test(attrs)) {
      findings.push({ kind: FINDING_KIND.CLICK_NO_KEY, file, line, tag, snippet })
    }
  }
  return findings
}

function* walkTsx(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') yield* walkTsx(full)
    } else if (full.endsWith('.tsx') && !SKIP_FILE_PATTERN.test(full)) {
      yield full
    }
  }
}

export function scanDirectory(srcDir, cwd = process.cwd()) {
  const findings = []
  for (const file of walkTsx(srcDir)) {
    findings.push(...scanSource(readFileSync(file, 'utf8'), relative(cwd, file)))
  }
  return findings
}

/** Render findings in the same markdown shape the workflow already posts. */
export function formatFindings(findings, max = DEFAULT_MAX_FINDINGS) {
  const sections = [
    [FINDING_KIND.CLICK_NO_KEY, 'Click handlers without keyboard equivalents'],
    [FINDING_KIND.DIV_NO_ROLE, 'Clickable divs without role or tabIndex'],
  ]
  let out = ''
  for (const [kind, title] of sections) {
    const rows = findings.filter(f => f.kind === kind)
    if (rows.length === 0) continue
    const shown = rows.slice(0, max).map(f => `${f.file}:${f.line}: <${f.tag}> ${f.snippet}`)
    const more = rows.length > max ? `\n... and ${rows.length - max} more` : ''
    out += `### ${title}\n\`\`\`\n${shown.join('\n')}${more}\n\`\`\`\n\n`
  }
  return out
}

function parseArgs(argv) {
  const opts = { srcDir: 'src', max: DEFAULT_MAX_FINDINGS, json: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') opts.json = true
    else if (arg === '--max') opts.max = Number(argv[++i]) || DEFAULT_MAX_FINDINGS
    else opts.srcDir = arg
  }
  return opts
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2))
  const findings = scanDirectory(opts.srcDir)
  if (opts.json) {
    process.stdout.write(JSON.stringify(findings, null, 2) + '\n')
  } else {
    process.stdout.write(formatFindings(findings, opts.max))
  }
}
