#!/usr/bin/env node
/**
 * Card Registry Integrity Test
 *
 * Validates the split card-registry architecture by checking that:
 *   1. Domain component keys are unique
 *   2. Every component/preloader import path resolves to a source file
 *   3. Domain demo-data sets reference registered card types
 *   4. DEMO_EXEMPT_CARDS entries reference registered card types
 *   5. The barrel export remains in place for backward compatibility
 */

import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const { resolve, dirname, join } = path

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const WEB_ROOT = resolve(__dirname, '..', 'web')
const CARDS_DIR = resolve(WEB_ROOT, 'src', 'components', 'cards')

const DOMAIN_FILES = [
  'cardRegistry.core.ts',
  'cardRegistry.compliance.ts',
  'cardRegistry.multiTenancy.ts',
  'cardRegistry.observability.ts',
  'cardRegistry.aiml.ts',
  'cardRegistry.gitops.ts',
  'cardRegistry.misc.ts',
]

const INDEX_FILE = resolve(CARDS_DIR, 'cardRegistry.index.ts')
const BARREL_FILE = resolve(CARDS_DIR, 'cardRegistry.ts')
const IMPORTS_FILE = resolve(CARDS_DIR, 'cardRegistry.imports.ts')
const METADATA_FILE = resolve(CARDS_DIR, 'cardMetadata.ts')
const DESCRIPTORS_FILE = resolve(CARDS_DIR, 'cardDescriptors.registry.ts')
const QUANTUM_FILE = resolve(CARDS_DIR, 'cardRegistry.quantum.ts')

const errors = []

function read(filePath) {
  return readFileSync(filePath, 'utf8')
}

function extractBlock(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start === -1) return ''
  const end = text.indexOf(endNeedle, start)
  if (end === -1) return ''
  return text.slice(start + startNeedle.length, end)
}

function extractQuotedStrings(text) {
  return [...text.matchAll(/'([^']+)'/g)].map(match => match[1])
}

function extractImportsExportNames(text) {
  const block = extractBlock(text, 'export {', '}')
  return new Set([...block.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map(match => match[1]))
}

function extractLocalConstNames(text) {
  return new Set([...text.matchAll(/const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map(match => match[1]))
}

function extractImportedComponentNames(text) {
  const block = extractBlock(text, "} from './cardRegistry.imports'", '')
  const match = text.match(/import \{([\s\S]*?)\} from '\.\/cardRegistry\.imports'/)
  if (!match) return new Set()
  return new Set([...match[1].matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map(m => m[1]))
}

function extractObjectBody(text, objectName) {
  const needle = `const ${objectName}: Record<string, CardComponent> = {`
  const start = text.indexOf(needle)
  if (start === -1) return ''
  const rest = text.slice(start + needle.length)
  const end = rest.indexOf('\n}')
  if (end === -1) return ''
  return rest.slice(0, end)
}

function extractMapBody(text, propertyName) {
  const needle = `${propertyName}: {`
  const start = text.indexOf(needle)
  if (start === -1) return ''
  const rest = text.slice(start + needle.length)
  const end = rest.indexOf('\n  },')
  if (end === -1) return ''
  return rest.slice(0, end)
}

function extractComponentEntries(text) {
  const body = extractObjectBody(text, 'components')
  const entries = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.+),$/)
    if (match) {
      entries.push({ key: match[1], value: match[2] })
    }
  }

  for (const match of text.matchAll(/components\['([^']+)'\]\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g)) {
    entries.push({ key: match[1], value: match[2], conditional: true })
  }

  return entries
}

function extractMapKeys(text, propertyName) {
  const body = extractMapBody(text, propertyName)
  return [...body.matchAll(/^\s*([a-zA-Z0-9_]+):/gm)].map(match => match[1])
}

function extractSetKeys(text, propertyName) {
  const match = text.match(new RegExp(`${propertyName}: new Set(?:<string>)?\\(\\[([\\s\\S]*?)\\]\\)`, 'm'))
  return match ? extractQuotedStrings(match[1]) : []
}

function resolveImportTarget(fromFile, relativeImport) {
  const absolute = resolve(dirname(fromFile), relativeImport)
  const candidates = [
    absolute,
    `${absolute}.ts`,
    `${absolute}.tsx`,
    `${absolute}.mts`,
    `${absolute}.js`,
    join(absolute, 'index.ts'),
    join(absolute, 'index.tsx'),
    join(absolute, 'index.mts'),
    join(absolute, 'index.js'),
  ]
  return candidates.find(existsSync)
}

function validateDomainFile(fileName, availableImportNames) {
  const filePath = resolve(CARDS_DIR, fileName)
  const text = read(filePath)
  const importedNames = extractImportedComponentNames(text)
  const localConstNames = extractLocalConstNames(text)
  const componentEntries = extractComponentEntries(text)

  for (const { key, value } of componentEntries) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      if (!(importedNames.has(value) || localConstNames.has(value))) {
        errors.push(`${fileName}: component '${key}' references unknown identifier '${value}'`)
      }
      if (importedNames.has(value) && !availableImportNames.has(value)) {
        errors.push(`${fileName}: component '${key}' imports '${value}' which is not exported by cardRegistry.imports.ts`)
      }
    }

    for (const match of value.matchAll(/import\('([^']+)'\)/g)) {
      if (!resolveImportTarget(filePath, match[1])) {
        errors.push(`${fileName}: component '${key}' import path '${match[1]}' does not resolve`)
      }
    }
  }

  for (const propertyName of ['chunkPreloaders']) {
    const body = extractMapBody(text, propertyName)
    for (const match of body.matchAll(/([a-zA-Z0-9_]+):\s*\(\)\s*=>\s*(?:[A-Za-z_][A-Za-z0-9_]*|import\('([^']+)'\))/g)) {
      const cardType = match[1]
      const importPath = match[2]
      if (importPath && !resolveImportTarget(filePath, importPath)) {
        errors.push(`${fileName}: preloader '${cardType}' import path '${importPath}' does not resolve`)
      }
    }
  }

  return {
    componentKeys: componentEntries.map(entry => entry.key),
    demoKeys: extractSetKeys(text, 'demoDataCards'),
    liveKeys: extractSetKeys(text, 'liveDataCards'),
  }
}

const availableImportNames = extractImportsExportNames(read(IMPORTS_FILE))
const registered = new Set()
const demoKeys = new Set()
const liveKeys = new Set()
const perDomainCounts = []

for (const fileName of DOMAIN_FILES) {
  const { componentKeys, demoKeys: fileDemoKeys, liveKeys: fileLiveKeys } = validateDomainFile(fileName, availableImportNames)
  perDomainCounts.push(`${fileName}:${componentKeys.length}`)
  for (const key of componentKeys) {
    if (registered.has(key)) {
      errors.push(`duplicate domain card type '${key}'`)
    }
    registered.add(key)
  }
  fileDemoKeys.forEach(key => demoKeys.add(key))
  fileLiveKeys.forEach(key => liveKeys.add(key))
}

for (const descriptorId of [...read(DESCRIPTORS_FILE).matchAll(/\bid:\s*'([^']+)'/g)].map(match => match[1])) {
  registered.add(descriptorId)
}

const quantumBody = extractBlock(read(QUANTUM_FILE), 'components: {', '  },')
for (const key of [...quantumBody.matchAll(/^\s*([a-zA-Z0-9_]+):/gm)].map(match => match[1])) {
  registered.add(key)
}

for (const key of demoKeys) {
  if (!registered.has(key)) {
    errors.push(`DEMO_DATA_CARDS entry '${key}' is not registered`)
  }
}

const demoExemptBlock = extractBlock(read(METADATA_FILE), 'export const DEMO_EXEMPT_CARDS = new Set([', '])')
for (const key of extractQuotedStrings(demoExemptBlock)) {
  if (!registered.has(key)) {
    errors.push(`DEMO_EXEMPT_CARDS entry '${key}' is not registered`)
  }
}

const barrelText = read(BARREL_FILE).trim()
if (barrelText !== "// Re-export everything from the index for backward compatibility\nexport * from './cardRegistry.index'") {
  errors.push('cardRegistry.ts is not the expected backward-compat barrel export')
}

const indexText = read(INDEX_FILE)
for (const required of [
  'CARD_COMPONENTS',
  'DEMO_DATA_CARDS',
  'LIVE_DATA_CARDS',
  'CARD_DEFAULT_WIDTHS',
  'prefetchCardChunks',
  'prefetchDemoCardChunks',
  'getDefaultCardWidth',
  'getCardComponent',
  'isCardTypeRegistered',
  'registerDynamicCardType',
  'getRegisteredCardTypes',
  'DEMO_EXEMPT_CARDS',
]) {
  if (!indexText.includes(required)) {
    errors.push(`cardRegistry.index.ts is missing '${required}'`)
  }
}

if (errors.length) {
  console.error('Card registry integrity test failed:\n')
  for (const error of errors) {
    console.error(`  • ${error}`)
  }
  process.exit(1)
}

console.log(`Card registry integrity OK (${perDomainCounts.join(', ')})`)
