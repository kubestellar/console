/**
 * Smoke test for the NamespaceQuotas card component.
 *
 * Verifies that the module loads without runtime errors and exports the
 * expected React component. Comprehensive behavioral coverage including
 * list/modal/delete modal flows already exists in ../NamespaceQuotas.test.tsx;
 * this file exists so the detect-untested-files CI check recognizes
 * NamespaceQuotas.tsx as covered (it only counts
 * src/components/cards/__tests__/<Name>.test.tsx matching the source file's basename).
 *
 * Filed for kubestellar/console#22502 (part of #22484).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../NamespaceQuotas'

describe('NamespaceQuotas module', () => {
  it('exports NamespaceQuotas as a function component', () => {
    expect(Mod.NamespaceQuotas).toBeDefined()
    expect(typeof Mod.NamespaceQuotas).toBe('function')
  })
})
