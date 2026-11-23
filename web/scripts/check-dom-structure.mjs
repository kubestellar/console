import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Syntax-only check: component output is unknown, so only inspect intrinsic JSX tags.
const categories = {
  button: ['Button inside button violations', 'nested button'],
  paragraph: ['Block elements inside paragraph tags', 'block element inside <p>'],
  list: ['List item outside list container', '<li> outside <ul>/<ol>'],
  heading: ['Nested heading elements', 'nested heading elements'],
}
const blocks = new Set(['div', 'section', 'article', 'header', 'footer', 'p', 'pre'])
const heading = tag => /^h[1-6]$/.test(tag)

export function checkDomStructure(source, filename = 'component.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings = []
  function visit(node, ancestors = []) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tag = opening.tagName.getText(file)
      const report = category => {
        const { line } = file.getLineAndCharacterOfPosition(opening.getStart(file))
        findings.push({ category, filename, line: line + 1 })
      }
      if (tag === 'button' && ancestors.includes('button')) report('button')
      if (blocks.has(tag) && ancestors.includes('p')) report('paragraph')
      if (tag === 'li' && ancestors.length && !ancestors.some(parent => parent === 'ul' || parent === 'ol' || /^[A-Z]/.test(parent))) report('list')
      if (heading(tag) && ancestors.some(heading)) report('heading')
      if (ts.isJsxElement(node)) {
        for (const child of node.children) visit(child, [...ancestors, tag])
      }
      return
    }
    ts.forEachChild(node, child => visit(child, ancestors))
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
    return checkDomStructure(fs.readFileSync(filename, 'utf8'), filename.replace(/^src\//, ''))
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scan(process.argv[2] || 'src')
  for (const [category, [title, message]] of Object.entries(categories)) {
    const matches = findings.filter(finding => finding.category === category).slice(0, 10)
    if (matches.length) {
      console.log(`### ${title}\n${matches.map(({ filename, line }) => `  - \`${filename}:${line}\` — ${message}`).join('\n')}\n`)
    }
  }
}
