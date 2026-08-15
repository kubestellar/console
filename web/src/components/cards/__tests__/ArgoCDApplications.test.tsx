/**
 * Smoke test for the ArgoCDApplications card component.
 *
 * Verifies that the module loads without runtime errors and exports the
 * expected React component. Comprehensive behavioral coverage already
 * exists in ../ArgoCDApplications.test.tsx; this file exists so the
 * detect-untested-files CI check recognizes ArgoCDApplications.tsx as
 * covered (it only counts src/components/cards/__tests__/<Name>.test.tsx
 * matching the source file's basename).
 *
 * Filed for kubestellar/console#22530 (part of #22484 / split from #22504).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../ArgoCDApplications'

describe('ArgoCDApplications module', () => {
  it('exports ArgoCDApplications as a function component', () => {
    expect(Mod.ArgoCDApplications).toBeDefined()
    expect(typeof Mod.ArgoCDApplications).toBe('function')
  })
})
