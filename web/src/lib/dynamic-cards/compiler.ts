import type { CompileResult, DynamicComponentResult } from './types'
import { createElement, type ComponentType } from 'react'
import type { CardComponentProps } from '../../components/cards/cardRegistry'
import { getDynamicScope } from './scope'

/**
 * Browser globals that must be shadowed inside the dynamic card sandbox.
 * Each is bound to `undefined` so card code cannot reach the real objects
 * through direct identifier access.
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
  'postMessage', 'crypto', 'Reflect',
] as const

/** Dangerous property names blocked by the runtime membrane. */
const BLOCKED_MEMBRANE_PROPERTIES = new Set<string>([
  'constructor',
  '__proto__',
  'prototype',
  ...BLOCKED_GLOBALS,
])

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

const STATIC_FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\.constructor\b/, label: '.constructor' },
  { re: /\.prototype\b/, label: '.prototype' },
  { re: /\.__proto__\b/, label: '.__proto__' },
  { re: /\[\s*(['"`])constructor\1\s*\]/, label: "['constructor']" },
  { re: /\[\s*(['"`])prototype\1\s*\]/, label: "['prototype']" },
  { re: /\[\s*(['"`])__proto__\1\s*\]/, label: "['__proto__']" },
  // Fail closed on computed-property syntax (`obj[key]`, `obj[prefix + suffix]`)
  // because it can be steered to constructor/prototype names after compilation.
  { re: /[A-Za-z0-9_$)\]}]\s*\[\s*(?!\d+\s*\])(?!['"`])[^\]\n]+\]/, label: 'computed bracket access' },
  { re: /\b__proto__\b/, label: '__proto__' },
  { re: /\bAsyncFunction\b/, label: 'AsyncFunction' },
  { re: /\bGeneratorFunction\b/, label: 'GeneratorFunction' },
]

const COMPUTED_DANGEROUS_KEY_ASSIGNMENT_RE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])(constructor|__proto__|prototype)\2/g

type MembraneTarget = object | Function

interface MembraneState {
  rawToProxy: WeakMap<MembraneTarget, MembraneTarget>
  proxyToRaw: WeakMap<MembraneTarget, MembraneTarget>
}

interface MembraneOptions {
  mutable: boolean
}

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

function isWrappable(value: unknown): value is MembraneTarget {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
}

function unwrapMembraneValue<T>(value: T, state: MembraneState): T {
  if (!isWrappable(value)) return value
  const raw = state.proxyToRaw.get(value)
  return (raw ?? value) as T
}

function isBlockedMembraneProperty(prop: PropertyKey): prop is string {
  return typeof prop === 'string' && BLOCKED_MEMBRANE_PROPERTIES.has(prop)
}

/**
 * Wrap sandbox-visible objects/functions in a Proxy membrane so runtime
 * computed-property access cannot recover constructor/prototype chains even if
 * the static analysis misses an obfuscated lookup.
 */
function wrapWithMembrane<T>(value: T, state: MembraneState, options: MembraneOptions): T {
  if (!isWrappable(value)) return value

  const rawValue = unwrapMembraneValue(value, state)
  if (!isWrappable(rawValue)) return rawValue as T

  const existingProxy = state.rawToProxy.get(rawValue)
  if (existingProxy) {
    return existingProxy as T
  }

  const proxy = new Proxy(rawValue, {
    get(target, prop, receiver) {
      if (isBlockedMembraneProperty(prop)) {
        throw new Error(`Sandbox blocked access to \"${prop}\"`)
      }
      const unwrappedReceiver = unwrapMembraneValue(receiver, state)
      const result = Reflect.get(target, prop, unwrappedReceiver)
      return wrapWithMembrane(result, state, options)
    },
    set(target, prop, nextValue, receiver) {
      if (isBlockedMembraneProperty(prop)) {
        throw new Error(`Sandbox blocked access to \"${prop}\"`)
      }
      if (!options.mutable) {
        throw new Error(`Sandbox blocked mutation of \"${String(prop)}\"`)
      }
      const unwrappedReceiver = unwrapMembraneValue(receiver, state)
      return Reflect.set(target, prop, unwrapMembraneValue(nextValue, state), unwrappedReceiver)
    },
    defineProperty(target, prop, descriptor) {
      if (isBlockedMembraneProperty(prop)) {
        throw new Error(`Sandbox blocked access to \"${prop}\"`)
      }
      if (!options.mutable) {
        throw new Error(`Sandbox blocked mutation of \"${String(prop)}\"`)
      }
      const nextDescriptor: PropertyDescriptor = { ...descriptor }
      if ('value' in descriptor) {
        nextDescriptor.value = unwrapMembraneValue(descriptor.value, state)
      }
      if (typeof descriptor.get === 'function') {
        nextDescriptor.get = unwrapMembraneValue(descriptor.get, state) as () => unknown
      }
      if (typeof descriptor.set === 'function') {
        nextDescriptor.set = unwrapMembraneValue(descriptor.set, state) as (value: unknown) => void
      }
      return Reflect.defineProperty(target, prop, nextDescriptor)
    },
    deleteProperty(target, prop) {
      if (isBlockedMembraneProperty(prop)) {
        throw new Error(`Sandbox blocked access to \"${prop}\"`)
      }
      if (!options.mutable) {
        throw new Error(`Sandbox blocked mutation of \"${String(prop)}\"`)
      }
      return Reflect.deleteProperty(target, prop)
    },
    getPrototypeOf() {
      throw new Error('Sandbox blocked prototype traversal')
    },
    setPrototypeOf() {
      throw new Error('Sandbox blocked prototype mutation')
    },
    apply(target, thisArg, argArray) {
      const nextArgs = argArray.map((arg) => unwrapMembraneValue(arg, state))
      const result = Reflect.apply(target, unwrapMembraneValue(thisArg, state), nextArgs)
      return wrapWithMembrane(result, state, options)
    },
    construct(target, argArray, newTarget) {
      const nextArgs = argArray.map((arg) => unwrapMembraneValue(arg, state))
      const instance = Reflect.construct(target, nextArgs, unwrapMembraneValue(newTarget, state) as Function)
      return wrapWithMembrane(instance, state, options)
    },
  }) as MembraneTarget

  state.rawToProxy.set(rawValue, proxy)
  state.proxyToRaw.set(proxy, rawValue)
  return proxy as T
}

function createMembraneState(): MembraneState {
  return {
    rawToProxy: new WeakMap<MembraneTarget, MembraneTarget>(),
    proxyToRaw: new WeakMap<MembraneTarget, MembraneTarget>(),
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findForbiddenSandboxPattern(compiledCode: string): string | null {
  for (const { re, label } of STATIC_FORBIDDEN_PATTERNS) {
    if (re.test(compiledCode)) {
      return label
    }
  }

  COMPUTED_DANGEROUS_KEY_ASSIGNMENT_RE.lastIndex = 0
  for (let match = COMPUTED_DANGEROUS_KEY_ASSIGNMENT_RE.exec(compiledCode); match !== null; match = COMPUTED_DANGEROUS_KEY_ASSIGNMENT_RE.exec(compiledCode)) {
    const [, alias, , dangerousValue] = match
    const computedAccess = new RegExp(`\\[\\s*${escapeRegExp(alias)}\\s*\\]`)
    if (computedAccess.test(compiledCode)) {
      return `[${alias}] -> ${dangerousValue}`
    }
  }

  return null
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
 * 3. Static analysis rejects constructor/prototype escape syntax before eval
 * 4. A Proxy membrane blocks runtime property access to constructor/prototype
 *    chains on injected scope values and sandbox module containers
 * 5. All injected scope values are deep-frozen so dynamic card code cannot
 *    mutate shared runtime state (cardHooks, icon registry, etc.)
 */
export function createCardComponent(compiledCode: string): DynamicComponentResult {
  try {
    const scope = getDynamicScope()

    // Extract the timer cleanup function before freezing.
    const timerCleanup = scope.__timerCleanup as (() => void) | undefined
    delete scope.__timerCleanup

    // Deep-freeze each scope value so dynamic code cannot mutate shared runtime
    // state (e.g. cardHooks.foo = evilImpl) via the injected refs.
    for (const key of Object.getOwnPropertyNames(scope)) {
      const currentValue = scope[key]
      if (currentValue !== null && typeof currentValue === 'object') {
        deepFreeze(currentValue)
      }
    }
    Object.freeze(scope)

    const forbiddenPattern = findForbiddenSandboxPattern(compiledCode)
    if (forbiddenPattern) {
      return {
        component: null,
        error: `Runtime error: sandbox blocked forbidden pattern: ${forbiddenPattern}`,
      }
    }

    // Build the module wrapper. `eval` is blocked via BLOCKED_GLOBALS as a
    // Function parameter (sloppy-mode parse allows it); we can't also shadow it
    // with `var eval` here because strict-mode var bindings on `eval` are a
    // SyntaxError.
    const moduleCode = `
      "use strict";
      var exports = __sandboxExports;
      var module = __sandboxModule;
      ${compiledCode}
      return module.exports.default || module.exports;
    `

    const blockedEntries: Record<string, undefined> = {}
    for (const name of BLOCKED_GLOBALS) {
      if (STRICT_RESERVED_BLOCKED.has(name)) continue
      if (!(name in scope)) {
        blockedEntries[name] = undefined
      }
    }

    const membraneState = createMembraneState()
    const sandboxExports = wrapWithMembrane<Record<string, unknown>>({}, membraneState, { mutable: true })
    const sandboxModule = wrapWithMembrane<{ exports: Record<string, unknown> }>({ exports: sandboxExports }, membraneState, { mutable: true })

    const fullScope: Record<string, unknown> = {
      ...blockedEntries,
      ...scope,
      __sandboxExports: sandboxExports,
      __sandboxModule: sandboxModule,
    }
    const scopeKeys = Object.keys(fullScope)
    const scopeValues = scopeKeys.map((key) => wrapWithMembrane(fullScope[key], membraneState, { mutable: false }))

    const factory = new Function(...scopeKeys, moduleCode)
    const component = factory(...scopeValues) as ComponentType<CardComponentProps>

    if (typeof component !== 'function') {
      return {
        component: null,
        error: 'Card module must export a default React component function.',
      }
    }

    const SafeComponent: ComponentType<CardComponentProps> = (props) =>
      createElement(component, { ...props, config: props.config ?? {} })

    return { component: SafeComponent, error: null, cleanup: timerCleanup }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { component: null, error: `Runtime error: ${message}` }
  }
}
