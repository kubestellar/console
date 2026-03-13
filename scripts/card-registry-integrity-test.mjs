#!/usr/bin/env node
/**
 * Card Registry Integrity Test
 *
 * Validates structural integrity of the card registry system:
 *   1. Every key in RAW_CARD_COMPONENTS maps to a resolvable file
 *   2. That file exports the expected named export
 *   3. Every key in DEMO_EXEMPT_CARDS exists in RAW_CARD_COMPONENTS
 *   4. Every key in DEMO_DATA_CARDS exists in RAW_CARD_COMPONENTS
 *
 * Uses the TypeScript Compiler API (from local devDependencies).
 * Zero runtime impact. CI-safe. No DOM. No Vite.
 *
 * Usage:
 *   node scripts/card-registry-integrity-test.mjs
 */

import { createRequire } from 'module'
import path from 'path'
const { resolve, dirname, join, relative, basename } = path

import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load TypeScript from web/node_modules (devDependency)
const require = createRequire(join(__dirname, '..', 'web', 'package.json'))
const ts = require('typescript')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEB_ROOT = resolve(__dirname, '..', 'web')
const CARDS_DIR = resolve(WEB_ROOT, 'src', 'components', 'cards')
const REGISTRY_FILE = resolve(CARDS_DIR, 'cardRegistry.ts')

// ---------------------------------------------------------------------------
// AST Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a TypeScript file into an AST SourceFile.
 */
function parseFile(filePath) {
    const source = readFileSync(filePath, 'utf-8')
    return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
}

/**
 * Walk an AST node tree, calling visitor for every node.
 */
function walk(node, visitor) {
    visitor(node)
    ts.forEachChild(node, child => walk(child, visitor))
}

/**
 * Extract a string literal value from an AST node, if it is one.
 */
function getStringLiteral(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.text
    }
    return null
}

/**
 * Unwrap chained .catch()/.then()/.finally() calls to find the underlying
 * dynamic import() call expression.  For example:
 *   import('./path').catch((err) => { throw err })
 * The outer node is a .catch() CallExpression; this function walks inward
 * through PropertyAccessExpression chains until it finds the import() call.
 *
 * @param {ts.CallExpression} node
 * @returns {ts.CallExpression | null} The import() call, or null if not found.
 */
function unwrapToImportCall(node) {
    // Direct import() call
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return node
    }

    // Chained: import('./path').catch(...) / .then(...) / .finally(...)
    if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text
        if (methodName === 'catch' || methodName === 'then' || methodName === 'finally') {
            const inner = node.expression.expression
            if (ts.isCallExpression(inner)) {
                return unwrapToImportCall(inner)
            }
        }
    }

    return null
}

// ---------------------------------------------------------------------------
// Phase 1: Extract declarations from cardRegistry.ts
// ---------------------------------------------------------------------------

/**
 * Extracts all card-related declarations from the registry file:
 * - Bundle variables: const _foo = import('./path')
 * - Lazy declarations: const Foo = lazy(() => import('./path').then(m => ({ default: m.Foo })))
 * - Lazy declarations via bundle: const Foo = lazy(() => _bundle.then(m => ({ default: m.Foo })))
 * - Static imports: import { Foo, Bar } from './path'
 */
function extractDeclarations(sourceFile) {
    // Maps identifier name → { importPath, exportName }
    const componentMap = new Map()
    // Maps bundle variable name → import path
    const bundleMap = new Map()

    walk(sourceFile, node => {
        // --- Static imports: import { X, Y } from './path' ---
        if (ts.isImportDeclaration(node) && node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)) {
            const modulePath = getStringLiteral(node.moduleSpecifier)
            if (modulePath && modulePath.startsWith('.')) {
                for (const spec of node.importClause.namedBindings.elements) {
                    const localName = spec.name.text
                    const originalName = spec.propertyName?.text || localName
                    componentMap.set(localName, { importPath: modulePath, exportName: originalName })
                }
            }
            return
        }

        // --- Variable declarations ---
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
                const varName = decl.name.text

                // --- Bundle variable: const _foo = import('./path') ---
                // Also handles chained patterns like import('./path').catch(...)
                if (varName.startsWith('_') && ts.isCallExpression(decl.initializer)) {
                    const importCall = unwrapToImportCall(decl.initializer)
                    if (importCall) {
                        const arg = importCall.arguments?.[0]
                        if (arg) {
                            const path = getStringLiteral(arg)
                            if (path) bundleMap.set(varName, path)
                        }
                        return
                    }
                }

                // --- Lazy declaration: const Foo = lazy(() => ...) ---
                if (ts.isCallExpression(decl.initializer) &&
                    ts.isIdentifier(decl.initializer.expression) &&
                    decl.initializer.expression.text === 'lazy') {
                    const lazyArg = decl.initializer.arguments[0]
                    if (!lazyArg || !ts.isArrowFunction(lazyArg)) continue

                    const info = extractLazyInfo(lazyArg.body, bundleMap)
                    if (info) {
                        componentMap.set(varName, info)
                    }
                }
            }
        }
    })

    return { componentMap, bundleMap }
}

/**
 * Extract { importPath, exportName } from the body of a lazy() arrow function.
 *
 * Handles two patterns:
 *   1. import('./Foo').then(m => ({ default: m.Foo }))
 *   2. _bundleVar.then(m => ({ default: m.Foo }))
 */
function extractLazyInfo(body, bundleMap) {
    // The body should be a .then() call expression
    if (!ts.isCallExpression(body)) return null

    // Check if it's a .then() call
    if (!ts.isPropertyAccessExpression(body.expression) ||
        body.expression.name.text !== 'then') return null

    const callee = body.expression.expression
    let importPath = null

    // Pattern 1: import('./Foo').then(...)
    if (ts.isCallExpression(callee) &&
        callee.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = callee.arguments?.[0]
        if (arg) importPath = getStringLiteral(arg)
    }

    // Pattern 2: _bundleVar.then(...)
    if (ts.isIdentifier(callee) && bundleMap.has(callee.text)) {
        importPath = bundleMap.get(callee.text)
    }

    if (!importPath) return null

    // Extract export name from .then(m => ({ default: m.ExportName }))
    const thenArg = body.arguments[0]
    if (!thenArg || !ts.isArrowFunction(thenArg)) return null

    const exportName = extractExportNameFromThenBody(thenArg.body)
    if (!exportName) return null

    return { importPath, exportName }
}

/**
 * Extract the export name from: m => ({ default: m.ExportName })
 */
function extractExportNameFromThenBody(body) {
    // Parenthesized expression: (...)
    let inner = body
    if (ts.isParenthesizedExpression(inner)) inner = inner.expression

    // Object literal: { default: m.ExportName }
    if (!ts.isObjectLiteralExpression(inner)) return null

    for (const prop of inner.properties) {
        if (ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) && prop.name.text === 'default' &&
            ts.isPropertyAccessExpression(prop.initializer)) {
            return prop.initializer.name.text
        }
    }
    return null
}

// ---------------------------------------------------------------------------
// Phase 2: Extract RAW_CARD_COMPONENTS entries
// ---------------------------------------------------------------------------

/**
 * Extract registry entries from RAW_CARD_COMPONENTS.
 * Returns Map<string, string> where key = card type, value = identifier name.
 */
function extractRegistryEntries(sourceFile) {
    const entries = new Map()

    walk(sourceFile, node => {
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) &&
                    decl.name.text === 'RAW_CARD_COMPONENTS' &&
                    decl.initializer &&
                    ts.isObjectLiteralExpression(decl.initializer)) {
                    for (const prop of decl.initializer.properties) {
                        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.initializer)) {
                            let key
                            if (ts.isIdentifier(prop.name)) {
                                key = prop.name.text
                            } else if (ts.isStringLiteral(prop.name)) {
                                key = prop.name.text
                            } else if (ts.isComputedPropertyName(prop.name)) {
                                continue // skip computed
                            }
                            if (key) {
                                entries.set(key, prop.initializer.text)
                            }
                        }
                    }
                }
            }
        }
    })

    return entries
}

// ---------------------------------------------------------------------------
// Phase 3: Extract Set<string> declarations (DEMO_EXEMPT_CARDS, DEMO_DATA_CARDS)
// ---------------------------------------------------------------------------

/**
 * Extract string values from a Set initializer:
 *   export const FOO = new Set([ 'a', 'b', 'c' ])
 */
function extractSetEntries(sourceFile, setName) {
    const entries = []

    walk(sourceFile, node => {
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === setName &&
                    decl.initializer && ts.isNewExpression(decl.initializer)) {
                    const arg = decl.initializer.arguments?.[0]
                    if (arg && ts.isArrayLiteralExpression(arg)) {
                        for (const elem of arg.elements) {
                            const str = getStringLiteral(elem)
                            if (str) entries.push(str)
                        }
                    }
                }
            }
        }
    })

    return entries
}

// ---------------------------------------------------------------------------
// Phase 4: File Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an import path relative to the cards directory.
 * Handles:
 *   './Foo'           → Foo.tsx, Foo.ts, Foo/index.tsx, Foo/index.ts
 *   './subdir/Foo'    → subdir/Foo.tsx, etc.
 *   './subdir'        → subdir/index.ts, subdir/index.tsx (barrel)
 */
function resolveCardFile(importPath) {
    // importPath is relative like './ClusterHealth' or './workload-detection'
    const base = resolve(CARDS_DIR, importPath)
    const candidates = [
        base + '.tsx',
        base + '.ts',
        join(base, 'index.tsx'),
        join(base, 'index.ts'),
    ]
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate
    }
    return null
}

// ---------------------------------------------------------------------------
// Phase 5: Export Validation
// ---------------------------------------------------------------------------

/**
 * Check if a TypeScript file exports a given named symbol.
 * Uses AST parsing — does NOT execute the file.
 * Automatically resolves and follows re-exports (e.g., `export { x } from './y'`).
 * 
 * @param {string} filePath 
 * @param {string} symbolName 
 * @param {Set<string>} visited - To prevent infinite recursion on circular dependencies
 * @returns {boolean}
 */
function fileExportsSymbol(filePath, symbolName, visited = new Set()) {
    if (visited.has(filePath)) return false
    visited.add(filePath)

    if (!existsSync(filePath)) return false

    const sourceFile = parseFile(filePath)
    let found = false

    walk(sourceFile, node => {
        if (found) return

        // export function Foo() {}
        if (ts.isFunctionDeclaration(node) && node.name?.text === symbolName) {
            const mods = ts.getModifiers(node) || []
            if (mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                found = true
            }
        }

        // export class Foo {}
        if (ts.isClassDeclaration(node) && node.name?.text === symbolName) {
            const mods = ts.getModifiers(node) || []
            if (mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                found = true
            }
        }

        // export const Foo = ...
        if (ts.isVariableStatement(node)) {
            const mods = ts.getModifiers(node) || []
            if (mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                for (const decl of node.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name) && decl.name.text === symbolName) {
                        found = true
                    }
                }
            }
        }

        // export { Foo } or export { Bar as Foo }
        if (ts.isExportDeclaration(node) && node.exportClause &&
            ts.isNamedExports(node.exportClause)) {
            for (const spec of node.exportClause.elements) {
                if (spec.name.text === symbolName) {
                    // Check if this is a re-export: `export { Foo } from './Foo'`
                    if (node.moduleSpecifier) {
                        const targetPath = traceBarrelExport(filePath, symbolName, node)
                        if (targetPath) {
                            found = fileExportsSymbol(targetPath, symbolName, visited)
                        }
                    } else {
                        found = true
                    }
                }
            }
        }
    })

    return found
}

/**
 * For a recognized re-export node in a barrel file, compute the target path.
 */
function traceBarrelExport(barrelPath, symbolName, exportDeclarationNode) {
    const modPath = getStringLiteral(exportDeclarationNode.moduleSpecifier)
    if (!modPath) return null

    const dir = dirname(barrelPath)
    const abs = resolve(dir, modPath)
    const candidates = [abs + '.tsx', abs + '.ts', join(abs, 'index.tsx'), join(abs, 'index.ts')]

    for (const c of candidates) {
        if (existsSync(c)) {
            return c
        }
    }
    return null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    console.log('🔍 Running Card Registry Integrity Test...')
    console.log(`   Registry: ${REGISTRY_FILE}`)
    console.log('')

    if (!existsSync(REGISTRY_FILE)) {
        console.error('❌ FATAL: cardRegistry.ts not found at', REGISTRY_FILE)
        process.exit(1)
    }

    const sourceFile = parseFile(REGISTRY_FILE)

    // --- Extract all declarations ---
    const { componentMap } = extractDeclarations(sourceFile)
    const registryEntries = extractRegistryEntries(sourceFile)
    const demoExemptEntries = extractSetEntries(sourceFile, 'DEMO_EXEMPT_CARDS')
    const demoDataEntries = extractSetEntries(sourceFile, 'DEMO_DATA_CARDS')

    console.log(`   Found ${registryEntries.size} registry entries`)
    console.log(`   Found ${componentMap.size} component declarations`)
    console.log(`   Found ${demoExemptEntries.length} DEMO_EXEMPT_CARDS entries`)
    console.log(`   Found ${demoDataEntries.length} DEMO_DATA_CARDS entries`)
    console.log('')

    const failures = []
    let passCount = 0

    // --- Validate each registry entry ---
    console.log('── Registry Entry Validation ──────────────────────────────────')

    for (const [cardType, identifierName] of registryEntries) {
        const info = componentMap.get(identifierName)

        if (!info) {
            failures.push({
                type: 'declaration',
                cardType,
                message: `No declaration found for identifier '${identifierName}'`,
            })
            console.log(`   ❌ ${cardType} → identifier '${identifierName}' has no traced declaration`)
            continue
        }

        // Resolve file path
        const resolvedFile = resolveCardFile(info.importPath)
        if (!resolvedFile) {
            failures.push({
                type: 'file',
                cardType,
                message: `File not found for import path '${info.importPath}'`,
            })
            console.log(`   ❌ ${cardType} → file not found: ${info.importPath}`)
            continue
        }
        // Check if symbol is exported directly from this file (handles re-exports too)
        let exportFound = fileExportsSymbol(resolvedFile, info.exportName)

        if (!exportFound) {
            failures.push({
                type: 'export',
                cardType,
                message: `Export '${info.exportName}' not found in ${relative(WEB_ROOT, resolvedFile)}`,
            })
            console.log(`   ❌ ${cardType} → export '${info.exportName}' not found in ${relative(WEB_ROOT, resolvedFile)}`)
            continue
        }

        passCount++
    }

    console.log(`   ✅ ${passCount} entries validated successfully`)
    console.log('')

    // --- Validate DEMO_EXEMPT_CARDS ---
    console.log('── DEMO_EXEMPT_CARDS Validation ──────────────────────────────')

    let demoExemptPass = 0
    for (const key of demoExemptEntries) {
        if (!registryEntries.has(key)) {
            failures.push({
                type: 'demo_exempt',
                cardType: key,
                message: `DEMO_EXEMPT_CARDS entry '${key}' not found in RAW_CARD_COMPONENTS`,
            })
            console.log(`   ❌ '${key}' not in registry`)
        } else {
            demoExemptPass++
        }
    }
    console.log(`   ✅ ${demoExemptPass}/${demoExemptEntries.length} entries valid`)
    console.log('')

    // --- Validate DEMO_DATA_CARDS ---
    console.log('── DEMO_DATA_CARDS Validation ────────────────────────────────')

    let demoDataPass = 0
    for (const key of demoDataEntries) {
        if (!registryEntries.has(key)) {
            failures.push({
                type: 'demo_data',
                cardType: key,
                message: `DEMO_DATA_CARDS entry '${key}' not found in RAW_CARD_COMPONENTS`,
            })
            console.log(`   ❌ '${key}' not in registry`)
        } else {
            demoDataPass++
        }
    }
    console.log(`   ✅ ${demoDataPass}/${demoDataEntries.length} entries valid`)
    console.log('')

    // --- Summary ---
    console.log('══════════════════════════════════════════════════════════════')
    if (failures.length === 0) {
        console.log('✅ Card Registry Integrity Test PASSED')
        console.log(`   ${passCount} components validated`)
        console.log(`   ${demoExemptPass} DEMO_EXEMPT_CARDS entries validated`)
        console.log(`   ${demoDataPass} DEMO_DATA_CARDS entries validated`)
        process.exit(0)
    } else {
        console.log(`❌ Card Registry Integrity Test FAILED — ${failures.length} error(s)`)
        console.log('')
        for (const f of failures) {
            console.log(`   [${f.type.toUpperCase()}] ${f.cardType}: ${f.message}`)
        }
        process.exit(1)
    }
}

main()
