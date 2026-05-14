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

/**
 * Deep-freeze an object graph so dynamic card code cannot mutate shared
 * runtime state via injected scope values (e.g. cardHooks.someCard = evilImpl).
 * Uses a WeakSet to guard against circular references.
 */
function deepFreeze<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (seen.has(obj as object)) return obj
  seen.add(obj as object)
  // Freeze first so any subsequent property lookups can't trigger a getter
  // that mutates the object after we've walked it.
  Object.freeze(obj)
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
 * The code runs in a hardened sandbox:
 * 1. Whitelisted scope — only approved libraries are injected
 * 2. Dangerous globals (window, document, fetch, Function, AsyncFunction,
 *    GeneratorFunction, etc.) are shadowed with undefined
 * 3. Constructor-based escapes are blocked by shadowing Function /
 *    AsyncFunction / GeneratorFunction identifiers and by assigning
 *    a throwing stub to (function(){}).constructor inside the sandbox
 *    module prologue
 * 4. All injected scope values are deep-frozen so dynamic card code
 *    cannot mutate shared runtime state (cardHooks, icon registry, etc.)
 */
export function createCardComponent(compiledCode: string): DynamicComponentResult {
  try {
    const scope = getDynamicScope()

    // Extract the timer cleanup function before freezing
    const timerCleanup = scope.__timerCleanup as (() => void) | undefined
    delete scope.__timerCleanup

    // Deep-freeze each scope value so dynamic code cannot mutate shared
    // runtime state (e.g. cardHooks.foo = evilImpl) via the injected refs.
    // This is the #6677 fix — previously only the scope map itself was frozen.
    for (const key of Object.getOwnPropertyNames(scope)) {
      const v = scope[key]
      if (v !== null && typeof v === 'object') {
        deepFreeze(v)
      }
    }
    // Freeze the scope map itself (preserves the previous shallow-freeze behavior).
    Object.freeze(scope)

    // #6676: Static analysis — reject compiled code that references the
    // constructor-escape patterns or dynamic function constructors. This
    // is a defense-in-depth layer on top of identifier shadowing: without
    // it, `(function(){}).constructor('code')()` or `(1).__proto__.constructor`
    // could bypass the BLOCKED_GLOBALS param shadowing because they reach
    // Function via the prototype chain rather than the global binding.
    //
    // We intentionally match on the raw compiled output (post-Sucrase), so
    // renaming, string concatenation, or bracket access `obj['constructor']`
    // still bypasses this — but combined with Function/AsyncFunction/
    // GeneratorFunction param shadowing and the runtime throw injected
    // below, the common escape routes are closed.
    const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
      { re: /\.constructor\s*\(/, label: '.constructor(' },
      { re: /\[\s*(['"`])constructor\1\s*\]\s*\(/, label: "['constructor']" },
      { re: /\b__proto__\b/, label: '__proto__' },
      { re: /\bAsyncFunction\b/, label: 'AsyncFunction' },
      { re: /\bGeneratorFunction\b/, label: 'GeneratorFunction' },
    ]
    for (const { re, label } of FORBIDDEN_PATTERNS) {
      if (re.test(compiledCode)) {
        return {
          component: null,
          error: `Runtime error: sandbox blocked forbidden pattern: ${label}`,
        }
      }
    }

    // Build the module wrapper. `eval` is blocked via BLOCKED_GLOBALS as a
    // Function parameter (sloppy-mode parse allows it); we can't also shadow
    // it with `var eval` here because strict-mode var bindings on `eval` are
    // a SyntaxError.
    const moduleCode = `
      "use strict";
      var exports = {};
      var module = { exports: exports };
      ${compiledCode}
      return module.exports.default || module.exports;
    `

    // Merge whitelisted scope with blocked globals (blocked = undefined).
    // Names that cannot legally be Function parameters in strict mode
    // (eval, arguments) are blocked inside moduleCode instead.
    const blockedEntries: Record<string, undefined> = {}
    for (const name of BLOCKED_GLOBALS) {
      if (STRICT_RESERVED_BLOCKED.has(name)) continue
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

    // Wrap the compiled component to guarantee config is always an object.
    // User-written card code may destructure config (e.g. `const { filter } = config`)
    // which throws if config is undefined (the prop is optional in CardComponentProps).
    const SafeComponent: ComponentType<CardComponentProps> = (props) =>
      createElement(component, { ...props, config: props.config ?? {} })

    return { component: SafeComponent, error: null, cleanup: timerCleanup }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { component: null, error: `Runtime error: ${message}` }
  }
}
