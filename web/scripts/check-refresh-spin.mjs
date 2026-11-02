import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const REFRESH_ICON = /^RefreshC(?:w|cw)$/
const BUSY_STATE = /loading|refreshing|fetching|retrying|executing|pending|busy/i

/**
 * Auto-QA's conservative, syntax-only refresh animation check.
 * Only button/Button controls with explicit busy state are actionable; imports,
 * metadata icons and synchronous reset/invert actions are not loading indicators.
 * Dynamic class helpers and conditional rendering are accepted, not evaluated.
 * This is not a proof that every fetching component provides refresh feedback.
 * Run from web/: node scripts/check-refresh-spin.mjs src
 * Tests: node --test scripts/check-refresh-spin.test.mjs
 */
export function checkRefreshSpin(source, filename = 'component.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings = []
  const opening = node => ts.isJsxElement(node) ? node.openingElement : node
  const attributes = node => opening(node).attributes.properties
  const attribute = (node, name) => attributes(node).find(attr => attr.name?.getText(file) === name)
  const isElement = node => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)
  const staticClass = node => {
    const value = attribute(node, 'className')?.initializer
    return value && ts.isStringLiteral(value) ? value.text : ''
  }
  const report = (node, message) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
    findings.push(`  - \`${filename}:${line + 1}\` — ${message}`)
  }
  function visit(node) {
    if (isElement(node) && REFRESH_ICON.test(opening(node).tagName.getText(file))) {
      let control = node.parent
      while (control && !ts.isFunctionLike(control)) {
        if (isElement(control) && /^(button|Button)$/.test(opening(control).tagName.getText(file))) break
        control = control.parent
      }
      if (control && isElement(control)) {
        const busy = ['disabled', 'aria-busy', 'loading', 'isLoading'].some(name => {
          const value = attribute(control, name)?.initializer
          return value && BUSY_STATE.test(value.getText(file))
        })
        const controlSource = control.getText(file)
        if (busy && !controlSource.includes('animate-spin')) {
          report(node, 'refresh control has busy state but no spin feedback')
        }
        // A literal spinner is valid when the icon/control is conditionally rendered.
        let conditional = false
        for (let ancestor = node.parent; ancestor && !ts.isFunctionLike(ancestor); ancestor = ancestor.parent) {
          if (ts.isConditionalExpression(ancestor) ||
              (ts.isBinaryExpression(ancestor) &&
               [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(ancestor.operatorToken.kind))) {
            conditional = true
          }
        }
        if (busy && /\banimate-spin\b/.test(staticClass(node)) && !conditional) {
          report(node, 'refresh control spins unconditionally')
        }
        // Only animation overrides on the icon count, not a parent's color transition.
        if (/animate-\[spin|\[animation-duration:/.test(staticClass(node)) ||
            /animationDuration|animation\s*:/.test(attribute(node, 'style')?.getText(file) || '')) {
          report(node, 'refresh icon overrides the standard spin animation')
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return findings
}

function scan(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '__tests__', '__mocks__'].includes(entry.name)) return []
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return scan(filename)
    if (!filename.endsWith('.tsx') || /\.(test|spec|stories)\.tsx$/.test(filename)) return []
    return checkRefreshSpin(fs.readFileSync(filename, 'utf8'), filename)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scan(process.argv[2] || 'src')
  if (findings.length) console.log(`### Refresh icon animation consistency\n${findings.join('\n')}`)
}
