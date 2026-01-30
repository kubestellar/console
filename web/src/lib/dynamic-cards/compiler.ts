import type { CompileResult, DynamicComponentResult } from './types'
import type { ComponentType } from 'react'
import type { CardComponentProps } from '../../components/cards/cardRegistry'
import { getDynamicScope } from './scope'

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
 * The code runs in a sandboxed scope with whitelisted libraries.
 */
export function createCardComponent(compiledCode: string): DynamicComponentResult {
  try {
    const scope = getDynamicScope()

    // Build the module wrapper
    // The compiled code should export a default component function
    const moduleCode = `
      "use strict";
      var exports = {};
      var module = { exports: exports };
      ${compiledCode}
      return module.exports.default || module.exports;
    `

    // Create function with scope variables
    const scopeKeys = Object.keys(scope)
    const scopeValues = scopeKeys.map(k => scope[k])

    // eslint-disable-next-line no-new-func
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
