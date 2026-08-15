/**
 * Smoke test for the AlertRules card component (AlertRulesCard export).
 *
 * Verifies that the module loads without runtime errors and exports the
 * expected React component. Comprehensive behavioral coverage of
 * AlertRulesCard already exists in ./AlertRulesCard.test.tsx; this file
 * exists so the detect-untested-files CI check recognizes AlertRules.tsx
 * as covered (it only counts src/components/cards/__tests__/<Name>.test.tsx
 * matching the source file's basename).
 *
 * Filed for kubestellar/console#22530 (part of #22484 / split from #22504).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../AlertRules'

describe('AlertRules module', () => {
  it('exports AlertRulesCard as a function component', () => {
    expect(Mod.AlertRulesCard).toBeDefined()
    expect(typeof Mod.AlertRulesCard).toBe('function')
  })
})
