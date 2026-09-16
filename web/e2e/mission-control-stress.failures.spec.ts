import { test, expect } from '@playwright/test'
import {
  DIALOG_TIMEOUT_MS,
  MAX_PAYLOAD_PROJECT_COUNT,
  MULTI_CLUSTER_COUNT,
  DEEP_PHASE_COUNT,
  MC_STORAGE_KEY,
  STRESS_PROJECTS,
  STRESS_ASSIGNMENTS,
  STRESS_PHASES,
  navigateTo,
  seedMCState,
  seedAndOpenMC,
} from './helpers/mission-stress-setup'

// FIXME(#16080): All stress tests in this file consistently timeout in CI preview environment.
// The preview environment has resource constraints and EventSource MIME type errors that
// prevent these tests from passing. Tests are marked as fixme pending investigation of:
// - Preview environment resource limits
// - EventSource MIME type configuration
// - Test timeout tuning for CI environment

/**
 * Mission Control STRESS Tests — Failures
 *
 * 'Failure & Edge Cases'.
 * Split from the original monolithic mission-control-stress.spec.ts (#23060).
 * Shared setup/mocks live in ./helpers/mission-stress-setup.ts.
 *
 * Modes:
 *   MOCK MODE (CI):  MOCK_AI=true npx playwright test e2e/mission-control-stress.*.spec.ts
 *   LIVE MODE:       KC_AGENT=true npx playwright test e2e/mission-control-stress.*.spec.ts --headed
 */

test.describe('Mission Control STRESS Tests', () => {
  test.describe.configure({ timeout: 120_000 })

  test.describe('Failure & Edge Cases', () => {

    test('14. state persistence under load — 15 projects, 5 clusters, 6 phases survive reload', async ({ page }) => {
      await navigateTo(page)

      // Seed a massive state object
      await seedMCState(page, {
        phase: 'blueprint',
        description: 'Full platform stack deployment across global fleet — testing localStorage persistence with maximum payload',
        title: 'Persistence Stress Test',
        projects: STRESS_PROJECTS,
        assignments: STRESS_ASSIGNMENTS,
        phases: STRESS_PHASES,
        deployMode: 'phased',
        overlay: 'security',
      })

      // Measure localStorage size
      const sizeKB = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        return raw ? Math.round(raw.length / 1024) : 0
      }, MC_STORAGE_KEY)

      // Should be substantial but under localStorage 5MB limit
      expect(sizeKB).toBeGreaterThan(1) // At least 1 KB
      expect(sizeKB).toBeLessThan(5000) // Under 5 MB

      // Reload the page
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: DIALOG_TIMEOUT_MS })

      // Verify state survived the reload
      const recovered = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        try {
          const parsed = JSON.parse(raw)
          const state = parsed.state || parsed
          return {
            projectCount: (state.projects || []).length,
            assignmentCount: (state.assignments || []).length,
            phaseCount: (state.phases || []).length,
            phase: state.phase,
            deployMode: state.deployMode,
            overlay: state.overlay,
            title: state.title,
          }
        } catch (error) { console.error('Error:', error); return null; }
      }, MC_STORAGE_KEY)

      expect(recovered).not.toBeNull()
      expect(recovered!.projectCount).toBe(MAX_PAYLOAD_PROJECT_COUNT)
      expect(recovered!.assignmentCount).toBe(MULTI_CLUSTER_COUNT)
      expect(recovered!.phaseCount).toBe(DEEP_PHASE_COUNT)
      expect(recovered!.phase).toBe('blueprint')
      expect(recovered!.deployMode).toBe('phased')
      expect(recovered!.overlay).toBe('security')
    })

    test('15. partial deploy failure — some projects succeed, others fail gracefully', async ({ page }) => {

      // Seed state with launch progress showing mixed results
      const mixedProgress = [
        {
          phase: 1,
          status: 'completed' as const,
          projects: [
            { name: 'cert-manager', status: 'completed' as const, missionId: 'mission-1' },
          ],
        },
        {
          phase: 2,
          status: 'completed' as const,
          projects: [
            { name: 'prometheus', status: 'completed' as const, missionId: 'mission-2' },
            { name: 'falco', status: 'failed' as const, missionId: 'mission-3', error: 'DaemonSet falco-node requires privileged containers — cluster SecurityContextConstraint denies privileged pods' },
            { name: 'opa', status: 'completed' as const, missionId: 'mission-4' },
          ],
        },
        {
          phase: 3,
          status: 'failed' as const,
          projects: [
            { name: 'istio', status: 'failed' as const, missionId: 'mission-5', error: 'Insufficient CPU: Istio control plane requires 4 CPU cores but only 2.1 available on node pool' },
            { name: 'jaeger', status: 'pending' as const },
          ],
        },
      ]

      await seedAndOpenMC(page, {
        phase: 'launching',
        description: 'Partial failure recovery test',
        title: 'Partial Failure',
        projects: STRESS_PROJECTS.slice(0, 6),
        assignments: [STRESS_ASSIGNMENTS[0]],
        phases: STRESS_PHASES.slice(0, 3),
        launchProgress: mixedProgress,
      })

      // Wait for the launching phase UI to render before reading body text
      await expect(page.getByText(/Partial Failure|launching|launch|deploy/i).first()).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
      const bodyText = await page.textContent('body')

      // Verify seeded state is visible — the launching phase should show
      // project names and/or phase progress. Check for any evidence of the
      // seeded data (project names, status keywords, or the title)
      expect(bodyText).toMatch(/cert-manager|prometheus|falco|opa|istio|jaeger|Partial Failure/i)

      // Verify the page renders without crashing despite mixed state
      expect(bodyText!.length).toBeGreaterThan(100)

      await page.screenshot({ path: 'test-results/stress-partial-failure.png', fullPage: true })
    })
  })
})
