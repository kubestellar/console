#!/usr/bin/env node
/**
 * ARIA-name scanner for the Auto-QA accessibility focus day.
 *
 * JSX attributes commonly span multiple lines. A line-oriented grep therefore
 * reports buttons and images whose aria-label or alt attribute is simply on a
 * later line. This scanner evaluates each complete opening tag and, for
 * buttons, the content up to its closing tag.
 *
 * Usage: node scripts/aria-a11y-scan.mjs [srcDir] [--max N]
 * Exit code is always 0; the workflow decides what to do with findings.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const TAG_START_PATTERN = /<([A-Za-z][A-Za-z0-9_.]*)(?=[\s/>])/g;
const ARIA_NAME_PATTERN = /\b(aria-label|aria-labelledby|title)\s*=/;
const ARIA_HIDDEN_PATTERN = /\baria-hidden\s*=\s*(\{?\s*["']?true["']?\s*\}?|\{true\})/;
const DEFAULT_MAX_FINDINGS = 15;
const SKIP_FILE_PATTERN = /(\.test\.tsx$|\.spec\.tsx$|\/__tests__\/|\/node_modules\/)/;

export const FINDING_KIND = Object.freeze({
  BUTTON_NAME: 'button-name',
  IMAGE_ALT: 'image-alt',
});

/**
 * Return the index just past the `>` that closes the opening JSX tag starting
 * at `start`, or -1 if the tag never closes. Braces and quoted strings may
 * contain `>` and must not terminate the tag.
 */
export function findTagEnd(source, start) {
  let braceDepth = 0;
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (braceDepth > 0) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      continue;
    }
    if (ch === '{') braceDepth = 1;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i + 1;
  }
  return -1;
}

function findExpressionEnd(source, start) {
  let braceDepth = 0;
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') braceDepth++;
    else if (ch === '}' && --braceDepth === 0) return i + 1;
  }
  return -1;
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === '\n') line++;
  return line;
}

/**
 * JSX expressions can render text, so treat any non-comment expression in a
 * button body as potentially providing an accessible name. Literal text is
 * returned separately from tags and expressions.
 */
function hasAccessibleContent(body) {
  let text = '';
  let hasExpression = false;
  for (let i = 0; i < body.length;) {
    if (body.startsWith('{/*', i)) {
      const commentEnd = body.indexOf('*/}', i + 3);
      i = commentEnd === -1 ? body.length : commentEnd + 3;
      continue;
    }
    if (body[i] === '<') {
      const tagEnd = findTagEnd(body, i + 1);
      if (tagEnd !== -1) {
        i = tagEnd;
        continue;
      }
    }
    if (body[i] === '{') {
      const expressionEnd = findExpressionEnd(body, i);
      if (expressionEnd !== -1) {
        hasExpression = true;
        i = expressionEnd;
        continue;
      }
    }
    text += body[i++];
  }
  return hasExpression || /\S/.test(text);
}

function scanSource(source, file = '<stdin>') {
  const findings = [];
  TAG_START_PATTERN.lastIndex = 0;
  let match;
  while ((match = TAG_START_PATTERN.exec(source)) !== null) {
    const tag = match[1];
    if (tag !== 'button' && tag !== 'img') continue;

    const openingTagEnd = findTagEnd(source, match.index + match[0].length);
    if (openingTagEnd === -1) break;
    const attrs = source.slice(match.index + match[0].length, openingTagEnd - 1);
    TAG_START_PATTERN.lastIndex = openingTagEnd;

    if (ARIA_HIDDEN_PATTERN.test(attrs)) continue;
    const line = lineOf(source, match.index);

    if (tag === 'img') {
      if (!/\balt\s*=/.test(attrs)) {
        findings.push({ kind: FINDING_KIND.IMAGE_ALT, file, line, tag, snippet: source.split('\n')[line - 1].trim() });
      }
      continue;
    }

    if (ARIA_NAME_PATTERN.test(attrs) || /\/\s*$/.test(attrs)) continue;
    const closingTag = source.indexOf('</button>', openingTagEnd);
    const body = closingTag === -1 ? '' : source.slice(openingTagEnd, closingTag);
    if (!hasAccessibleContent(body)) {
      findings.push({ kind: FINDING_KIND.BUTTON_NAME, file, line, tag, snippet: source.split('\n')[line - 1].trim() });
    }
  }
  return findings;
}

export { scanSource };

function* walkTsx(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') yield* walkTsx(full);
    } else if (full.endsWith('.tsx') && !SKIP_FILE_PATTERN.test(full)) {
      yield full;
    }
  }
}

export function scanDirectory(srcDir, cwd = process.cwd()) {
  const findings = [];
  for (const file of walkTsx(srcDir)) {
    findings.push(...scanSource(readFileSync(file, 'utf8'), relative(cwd, file)));
  }
  return findings;
}

export function formatFindings(findings, max = DEFAULT_MAX_FINDINGS) {
  const sections = [
    [FINDING_KIND.BUTTON_NAME, 'Buttons missing an accessible name'],
    [FINDING_KIND.IMAGE_ALT, 'Images without alt text'],
  ];
  let out = '';
  for (const [kind, title] of sections) {
    const rows = findings.filter(f => f.kind === kind);
    if (rows.length === 0) continue;
    const shown = rows.slice(0, max).map(f => `${f.file}:${f.line}: <${f.tag}> ${f.snippet}`);
    const more = rows.length > max ? `\n... and ${rows.length - max} more` : '';
    out += `### ${title}\n\`\`\`\n${shown.join('\n')}${more}\n\`\`\`\n\n`;
  }
  return out;
}

function parseArgs(argv) {
  const opts = { srcDir: 'src', max: DEFAULT_MAX_FINDINGS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max') opts.max = Number(argv[++i]) || DEFAULT_MAX_FINDINGS;
    else opts.srcDir = arg;
  }
  return opts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  process.stdout.write(formatFindings(scanDirectory(opts.srcDir), opts.max));
}
