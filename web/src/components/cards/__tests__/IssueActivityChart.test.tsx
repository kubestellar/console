/**
 * Smoke test for the IssueActivityChart card component.
 *
 * Verifies that the module loads without runtime errors and exports the
 * expected React component (both default and named exports). Comprehensive
 * behavioral coverage already exists in ../IssueActivityChart.test.tsx; this
 * file exists so the detect-untested-files CI check recognizes
 * IssueActivityChart.tsx as covered (it only counts
 * src/components/cards/__tests__/<Name>.test.tsx matching the source file's
 * basename).
 *
 * Filed for kubestellar/console#22530 (part of #22484 / split from #22504).
 */
import { describe, it, expect } from 'vitest'
import IssueActivityChartDefault, { IssueActivityChart } from '../IssueActivityChart'

describe('IssueActivityChart module', () => {
  it('exports a default export that is a valid React component', () => {
    expect(IssueActivityChartDefault).toBeDefined()
    // React.memo-wrapped components are objects, not plain functions.
    expect(['function', 'object']).toContain(typeof IssueActivityChartDefault)
    expect(IssueActivityChartDefault).not.toBeNull()
  })

  it('exports a named IssueActivityChart matching the default export', () => {
    expect(IssueActivityChart).toBe(IssueActivityChartDefault)
  })
})
