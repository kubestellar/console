import type { CompileResult, DynamicComponentResult } from './types'
import type { ComponentType } from 'react'
import type { CardComponentProps } from '../../components/cards/cardRegistry'
import { getDynamicScope } from './scope'

/**
 * Browser globals that must be shadowed inside the dynamic card sandbox.
 * Each is bound to `undefined` so card code cannot reach the real objects.
 */
const BLOCKED_GLOBALS = [
  'window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'eval', 'Function', 'importScripts',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'navigator', 'location', 'history',
  'setTimeout', 'setInterval', 'requestAnimationFrame',
  'postMessage', 'crypto',
] as const

/**
 * Compile TSX source code to JavaScript using Sucrase.
 * Sucrase is loaded dynamically to avoid bloating the main bundle.
 */
export async function compileCardCode(tsx: string): Promise<CompileResult> {
  try {
    // Dynamic import to keep Sucrase out of the main bundle
    const { transform } = await import('sucrase')
    const result = transform(tsx, {
      transforms: ['typescript', 'jsx'],
      jsxRuntime: 'classic',
      jsxPragma: 'React.createElement',
      jsxFragmentPragma: 'React.Fragment',
      production: true,
    })
    return { code: result.code, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { code: null, error: `Compilation error: ${message}` }
  }
}

/**
 * Create a React component from compiled JavaScript code.
 * The code runs in a hardened sandbox:
 * 1. Whitelisted scope — only approved libraries are injected
 * 2. Dangerous globals (window, document, fetch, etc.) are shadowed with undefined
 * 3. The scope object is frozen to prevent prototype pollution
 */
export function createCardComponent(compiledCode: string): DynamicComponentResult {
  try {
    const scope = getDynamicScope()

    // Freeze each scope value that is an object to prevent prototype pollution
    // (shallow freeze — we freeze the scope map itself, not deep internals of React)
    Object.freeze(scope)

    // Build the module wrapper
    // The compiled code should export a default component function
    const moduleCode = `
      "use strict";
      var exports = {};
      var module = { exports: exports };
      ${compiledCode}
      return module.exports.default || module.exports;
    `

    // Merge whitelisted scope with blocked globals (blocked = undefined)
    const blockedEntries: Record<string, undefined> = {}
    for (const name of BLOCKED_GLOBALS) {
      // Only block if not already in the whitelist (e.g. if we ever expose a safe subset)
      if (!(name in scope)) {
        blockedEntries[name] = undefined
      }
    }

    const fullScope = { ...blockedEntries, ...scope }
    const scopeKeys = Object.keys(fullScope)
    const scopeValues = scopeKeys.map(k => fullScope[k])

    const factory = new Function(...scopeKeys, moduleCode)
    const component = factory(...scopeValues) as ComponentType<CardComponentProps>

    if (typeof component !== 'function') {
      return {
        component: null,
        error: 'Card module must export a default React component function.',
      }
    }

    return { component, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { component: null, error: `Runtime error: ${message}` }
  }
}
