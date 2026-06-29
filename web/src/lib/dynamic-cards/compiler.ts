import type { CompileResult, DynamicComponentResult } from './types'
import { createElement, type ComponentType } from 'react'
import type { CardComponentProps } from '../../components/cards/cardRegistry'
import { getDynamicScope } from './scope'

/**
 * Browser globals that must be shadowed inside the dynamic card sandbox.
 * Each is bound to `undefined` so card code cannot reach the real objects.
 */
const BLOCKED_GLOBALS = [
  'window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'eval', 'Function', 'AsyncFunction', 'GeneratorFunction',
  'importScripts',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'navigator', 'location', 'history',
  // Timer APIs: listed for fail-closed safety. Safe wrappers in getDynamicScope()
  // override these via the `if (!(name in scope))` guard in the merge loop below.
  // If the wrappers are ever removed from scope, these fall back to blocking.
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame',
  'postMessage', 'crypto',
  // #16505: Block Reflect/Proxy to prevent sandbox escape via prototype walking
  'Reflect', 'Proxy',
  // #16898: Block encoding APIs that can construct blocked identifiers at runtime
  'atob', 'btoa', 'TextDecoder', 'TextEncoder',
  // #19864: Block additional async primitives
  'queueMicrotask', 'structuredClone', 'MessageChannel', 'AbortController',
] as const

/**
 * Identifiers we can't safely inject as Function-body `var` declarations in
 * strict mode (e.g. `var eval = …` is a SyntaxError). These fall back to
 * being blocked via Function parameter shadowing, which is allowed because
 * `new Function(...)` parses its parameter list in sloppy mode.
 *
 * `arguments` is neither a valid parameter name nor a valid `var` name in
 * strict mode, but the enclosing `new Function` provides its own `arguments`
 * object that refers to the outer call (scopeValues), shadowing any global.
 */
const STRICT_RESERVED_BLOCKED = new Set<string>(['arguments'])

const FORBIDDEN_SANDBOX_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b__proto__\b/, label: '__proto__' },
  { re: /\b__lookupGetter__\b/, label: '__lookupGetter__' },
  { re: /\b__defineGetter__\b/, label: '__defineGetter__' },
  { re: /\b__defineSetter__\b/, label: '__defineSetter__' },
  { re: /\.constructor\b/, label: '.constructor' },
  { re: /\[\s*(['"`])constructor\1\s*\]/, label: "['constructor']" },
  { re: /\bAsyncFunction\b/, label: 'AsyncFunction' },
  { re: /\bGeneratorFunction\b/, label: 'GeneratorFunction' },
  { re: /\bgetPrototypeOf\b/, label: 'getPrototypeOf' },
  { re: /\bsetPrototypeOf\b/, label: 'setPrototypeOf' },
  { re: /\bReflect\b/, label: 'Reflect' },
  { re: /\[\s*[^'"`\]]*(?:con|struct|ctor)/, label: 'computed constructor access' },
  { re: /\bprototype\b/, label: 'prototype' },
  { re: /\bfromCharCode\b/, label: 'fromCharCode' },
  { re: /\bfromCodePoint\b/, label: 'fromCodePoint' },
  { re: /\bcharCodeAt\b/, label: 'charCodeAt' },
  { re: /\bcodePointAt\b/, label: 'codePointAt' },
  { re: /\bString\.raw\b/, label: 'String.raw' },
  { re: /\bgetOwnPropertyDescriptor\b/, label: 'getOwnPropertyDescriptor' },
  { re: /\bimport\s*\(/, label: 'dynamic import()' },
]

/**
 * Deep-freeze an object graph so dynamic card code cannot mutate shared
 * runtime state via injected scope values (e.g. cardHooks.someCard = evilImpl).
 * Uses a WeakSet to guard against circular references.
 * #19864: Now also freezes prototypes to prevent prototype pollution.
 */
function deepFreeze<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (seen.has(obj as object)) return obj
  seen.add(obj as object)
  // Freeze first so any subsequent property lookups can't trigger a getter
  // that mutates the object after we've walked it.
  Object.freeze(obj)
  
  // #19864: Freeze the prototype chain to prevent prototype pollution
  const proto = Object.getPrototypeOf(obj)
  if (proto !== null && proto !== Object.prototype && !Object.isFrozen(proto)) {
    deepFreeze(proto, seen)
  }
  
  for (const key of Object.getOwnPropertyNames(obj)) {
    let value: unknown
    try {
      value = (obj as Record<string, unknown>)[key]
    } catch {
      // Some built-ins (e.g. certain DOM proxies) throw on property access;
      // we skip those since there's nothing to freeze.
      continue
    }
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value, seen)
    }
  }
  return obj
}

/** Maximum time to wait for dynamic card compilation before failing fast. */
export const CARD_COMPILE_TIMEOUT_MS = 5000

/**
 * Compile TSX source code to JavaScript using Sucrase.
 * Sucrase is loaded dynamically to avoid bloating the main bundle.
 */
async function runCompileCardCode(tsx: string): Promise<CompileResult> {
  try {
    // Dynamic import to keep Sucrase out of the main bundle
    const { transform } = await import('sucrase')
    const result = transform(tsx, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'classic',
      jsxPragma: 'React.createElement',
      jsxFragmentPragma: 'React.Fragment',
      production: true,
    })
    return { code: result.code, error: null }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { code: null, error: `Compilation error: ${message}` }
  }
}

export async function compileCardCode(tsx: string, timeoutMs = CARD_COMPILE_TIMEOUT_MS): Promise<CompileResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutResult = new Promise<CompileResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        code: null,
        error: `Compilation error: timed out after ${timeoutMs}ms. Please try again.`,
      })
    }, timeoutMs)
  })

  try {
    return await Promise.race([runCompileCardCode(tsx), timeoutResult])
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Create a React component from compiled JavaScript code.
 * #19864 Security fix: Replaced new Function() with blob URL ES module import.
 * This approach works with strict CSP (no unsafe-eval) by creating a temporary
 * ES module blob and using dynamic import(), which is allowed under CSP.
 * 
 * The code runs in a hardened sandbox:
 * 1. Whitelisted scope — only approved libraries are injected via module exports
 * 2. Dangerous globals blocked via static analysis (not runtime shadowing)
 * 3. All injected scope values are deep-frozen so dynamic card code
 *    cannot mutate shared runtime state (cardHooks, icon registry, etc.)
 * 4. Prototypes of injected objects are frozen to prevent pollution
 */
export async function createCardComponent(compiledCode: string): Promise<DynamicComponentResult> {
  try {
    const scope = getDynamicScope()

    // Extract the timer cleanup function before freezing
    const timerCleanup = scope.__timerCleanup as (() => void) | undefined
    delete scope.__timerCleanup

    // Deep-freeze each scope value so dynamic code cannot mutate shared
    // runtime state (e.g. cardHooks.foo = evilImpl) via the injected refs.
    for (const key of Object.getOwnPropertyNames(scope)) {
      const v = scope[key]
      if (v !== null && typeof v === 'object') {
        deepFreeze(v)
      }
    }
    Object.freeze(scope)

    // #6676 + #19864: Static analysis — reject forbidden patterns
    for (const { re, label } of FORBIDDEN_SANDBOX_PATTERNS) {
      if (re.test(compiledCode)) {
        return {
          component: null,
          error: `Runtime error: sandbox blocked forbidden pattern: ${label}`,
        }
      }
    }

    // Merge whitelisted scope with blocked globals
    const blockedEntries: Record<string, undefined> = {}
    for (const name of BLOCKED_GLOBALS) {
      if (STRICT_RESERVED_BLOCKED.has(name)) continue
      if (!(name in scope)) {
        blockedEntries[name] = undefined
      }
    }

    const fullScope = { ...blockedEntries, ...scope }
    const scopeKeys = Object.keys(fullScope)
    
    // Store scope in a temporary global for the module to access
    const scopeId = `__CARD_SCOPE_${Date.now()}_${Math.random().toString(36).slice(2)}`
    ;(globalThis as Record<string, unknown>)[scopeId] = fullScope
    
    // Create an ES module that:
    // 1. Retrieves the frozen scope from globalThis
    // 2. Destructures scope variables into the module context
    // 3. Executes the compiled card code
    // 4. Exports the resulting component
    const moduleSource = `
      const __scope = globalThis.${scopeId};
      delete globalThis.${scopeId};
      const { ${scopeKeys.join(', ')} } = __scope;
      
      var exports = {};
      var module = { exports: exports };
      
      ${compiledCode}
      
      export default module.exports.default || module.exports;
    `
    
    let blobUrl: string | null = null
    
    try {
      // Create a blob URL for the module
      const blob = new Blob([moduleSource], { type: 'text/javascript' })
      blobUrl = URL.createObjectURL(blob)
      
      // Import the module (this is CSP-compliant for blob: URLs)
      const module = await import(/* webpackIgnore: true */ blobUrl)
      const component = module.default as ComponentType<CardComponentProps>

      if (typeof component !== 'function') {
        return {
          component: null,
          error: 'Card module must export a default React component function.',
        }
      }

      // Wrap the compiled component to guarantee config is always an object
      const SafeComponent: ComponentType<CardComponentProps> = (props) =>
        createElement(component, { ...props, config: props.config ?? {} })

      return { component: SafeComponent, error: null, cleanup: timerCleanup }
    } finally {
      // Clean up
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      delete (globalThis as Record<string, unknown>)[scopeId]
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { component: null, error: `Runtime error: ${message}` }
  }
}
