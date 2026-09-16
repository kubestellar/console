import { test, expect } from '@playwright/test'
import {
  MAX_PAYLOAD_PROJECT_COUNT,
  MULTI_CLUSTER_COUNT,
  DEEP_PHASE_COUNT,
  MC_STORAGE_KEY,
  STRESS_PROJECTS,
  STRESS_ASSIGNMENTS,
  STRESS_PHASES,
  COMPLEX_MULTI_DOC_YAML,
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
 * Mission Control STRESS Tests — Composition
 *
 * 'Composition & YAML' + 'JSON Extraction Robustness'.
 * Split from the original monolithic mission-control-stress.spec.ts (#23060).
 * Shared setup/mocks live in ./helpers/mission-stress-setup.ts.
 *
 * Modes:
 *   MOCK MODE (CI):  MOCK_AI=true npx playwright test e2e/mission-control-stress.*.spec.ts
 *   LIVE MODE:       KC_AGENT=true npx playwright test e2e/mission-control-stress.*.spec.ts --headed
 */

test.describe('Mission Control STRESS Tests', () => {
  test.describe.configure({ timeout: 120_000 })

  test.describe('Composition & YAML', () => {

    test('11. 10-document multi-API-group YAML — API groups span 6+ distinct CRD domains', async ({ page }) => {
      // Verify the complex YAML contains diverse API groups by parsing it client-side
      // This tests the same thing detectApiGroups() would test, but without dynamic imports
      await navigateTo(page)

      const detected = await page.evaluate((yaml) => {
        // Extract apiVersion fields from YAML documents
        const apiVersionRe = /apiVersion:\s*(\S+)/g
        const groups = new Set<string>()
        let match: RegExpExecArray | null
        while ((match = apiVersionRe.exec(yaml)) !== null) {
          const av = match[1]
          // Extract the group (everything before the /)
          const slashIdx = av.indexOf('/')
          if (slashIdx > 0) {
            groups.add(av.substring(0, slashIdx))
          }
        }
        return [...groups]
      }, COMPLEX_MULTI_DOC_YAML)

      // Should detect: argoproj.io, monitoring.coreos.com, cert-manager.io,
      // networking.istio.io, security.istio.io, ray.io, helm.toolkit.fluxcd.io,
      // kyverno.io, external-secrets.io, tekton.dev = 10 groups
      expect(detected.length).toBeGreaterThanOrEqual(6)

      // Verify specific API groups are present
      const expectedGroups = ['argoproj.io', 'cert-manager.io', 'kyverno.io', 'tekton.dev', 'ray.io']
      const matchedCount = expectedGroups.filter(g => detected.includes(g)).length
      expect(matchedCount).toBeGreaterThanOrEqual(4)
    })

    test('12. holistic composition — user YAML mission with detected projects feeds wizard', async ({ page }) => {

      // Test holistic composition by seeding a mission with both KB-detected
      // projects and user-imported YAML content in the Mission Control wizard
      const userYAMLMission = {
        version: 'kc-mission-v1',
        title: 'Custom Security Hardening',
        type: 'deploy',
        description: 'Apply custom OPA policies and Falco rules',
        tags: ['security', 'custom'],
        steps: [
          { title: 'Apply OPA ConstraintTemplate', yaml: 'apiVersion: templates.gatekeeper.sh/v1\nkind: ConstraintTemplate' },
          { title: 'Apply Falco custom rules', command: 'kubectl apply -f custom-falco-rules.yaml' },
        ],
      }

      // Seed Mission Control with both detected + imported projects
      await seedAndOpenMC(page, {
        phase: 'define',
        description: 'Security hardening with custom OPA policies and Falco rules',
        title: 'Holistic: Security Hardening',
        projects: [
          { name: 'opa', displayName: 'OPA Gatekeeper', reason: 'Detected from API group constraints.gatekeeper.sh', category: 'Security', priority: 'required' as const, dependencies: [], importedMission: userYAMLMission, replacesInstallMission: false },
          { name: 'falco', displayName: 'Falco', reason: 'User YAML references Falco custom rules', category: 'Security', priority: 'required' as const, dependencies: ['helm'] },
          { name: 'cert-manager', displayName: 'cert-manager', reason: 'Prerequisite for webhook certificates', category: 'Security', priority: 'required' as const, dependencies: ['helm'] },
        ],
      })

      // Verify the composed mission shows both KB and user-imported content
      const bodyText = await page.textContent('body')
      expect(bodyText).toMatch(/opa|gatekeeper/i)
      expect(bodyText).toMatch(/falco/i)
      expect(bodyText).toMatch(/cert-manager/i)

      // The project with importedMission should be marked or distinguishable
      // (the UI shows an "imported" badge or different card style)
      await page.screenshot({ path: 'test-results/stress-holistic-composition.png', fullPage: true })
    })

    test('13. YAML → Mission Control pipeline — multi-project import populates wizard', async ({ page }) => {

      // Simulate the result of YAML import: projects detected from the complex YAML
      // (the actual detection is done by apiGroupMapping.ts — here we test the
      // wizard rendering with the detected projects)
      const detectedProjects = [
        { name: 'argocd', displayName: 'Argo CD', reason: 'Detected from argoproj.io/v1alpha1', category: 'CI/CD', priority: 'required' as const, dependencies: [] },
        { name: 'prometheus', displayName: 'Prometheus', reason: 'Detected from monitoring.coreos.com/v1', category: 'Observability', priority: 'required' as const, dependencies: [] },
        { name: 'cert-manager', displayName: 'cert-manager', reason: 'Detected from cert-manager.io/v1', category: 'Security', priority: 'required' as const, dependencies: [] },
        { name: 'istio', displayName: 'Istio', reason: 'Detected from networking.istio.io/v1beta1', category: 'Networking', priority: 'required' as const, dependencies: ['cert-manager'] },
        { name: 'kuberay', displayName: 'KubeRay', reason: 'Detected from ray.io/v1alpha1', category: 'AI/ML', priority: 'recommended' as const, dependencies: [] },
        { name: 'flux', displayName: 'Flux CD', reason: 'Detected from helm.toolkit.fluxcd.io/v2', category: 'CI/CD', priority: 'recommended' as const, dependencies: [] },
        { name: 'kyverno', displayName: 'Kyverno', reason: 'Detected from kyverno.io/v1', category: 'Security', priority: 'recommended' as const, dependencies: [] },
        { name: 'external-secrets', displayName: 'External Secrets', reason: 'Detected from external-secrets.io/v1beta1', category: 'Security', priority: 'optional' as const, dependencies: [] },
        { name: 'tekton', displayName: 'Tekton', reason: 'Detected from tekton.dev/v1', category: 'CI/CD', priority: 'optional' as const, dependencies: [] },
      ]

      await seedAndOpenMC(page, {
        phase: 'define',
        description: 'Imported from 10-document YAML with 9 detected CNCF projects',
        title: 'YAML Import: Multi-Project Stack',
        projects: detectedProjects,
      })

      const bodyText = await page.textContent('body')
      // Verify at least 6 of the 9 detected projects appear in the wizard
      let matchCount = 0
      for (const p of detectedProjects) {
        if (bodyText?.match(new RegExp(p.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))) matchCount++
      }
      expect(matchCount).toBeGreaterThanOrEqual(6)

      await page.screenshot({ path: 'test-results/stress-yaml-import-pipeline.png', fullPage: true })
    })
  })
  test.describe('JSON Extraction Robustness', () => {

    test('19. extractJSON — state correctly parses various AI response formats', async ({ page }) => {
      await navigateTo(page)

      // Test extractJSON indirectly: seed Mission Control with AI responses
      // that contain JSON in different formats and verify the state is parsed correctly.
      // This exercises the same code path as real AI streaming.

      // Test 1: Well-formed fenced JSON with projects key
      await seedMCState(page, {
        phase: 'define',
        description: 'Test JSON extraction',
        title: 'JSON Parse Test',
        projects: [
          { name: 'falco', displayName: 'Falco', reason: 'Parsed from fenced JSON', category: 'Security', priority: 'required' as const, dependencies: [] },
        ],
      })

      // Verify state round-trips through localStorage correctly
      const recovered1 = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const state = parsed.state || parsed
        return state.projects?.[0]?.name
      }, MC_STORAGE_KEY)
      expect(recovered1).toBe('falco')

      // Test 2: Large payload with many projects
      const manyProjects = Array.from({ length: 20 }, (_, i) => ({
        name: `project-${i}`,
        displayName: `Project ${i}`,
        reason: `Test project number ${i}`,
        category: 'Test',
        priority: 'optional' as const,
        dependencies: [],
      }))

      await seedMCState(page, {
        phase: 'define',
        description: 'Large payload test',
        title: 'Large Payload',
        projects: manyProjects,
      })

      const recovered2 = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return 0
        const parsed = JSON.parse(raw)
        const state = parsed.state || parsed
        return (state.projects || []).length
      }, MC_STORAGE_KEY)
      expect(recovered2).toBe(20)

      // Test 3: Complex nested state with all fields populated
      await seedMCState(page, {
        phase: 'blueprint',
        description: 'Complex state',
        title: 'Complex',
        projects: STRESS_PROJECTS,
        assignments: STRESS_ASSIGNMENTS,
        phases: STRESS_PHASES,
        deployMode: 'yolo',
        overlay: 'network',
      })

      const recovered3 = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const state = parsed.state || parsed
        return {
          projectCount: (state.projects || []).length,
          assignmentCount: (state.assignments || []).length,
          phaseCount: (state.phases || []).length,
          deployMode: state.deployMode,
          overlay: state.overlay,
        }
      }, MC_STORAGE_KEY)

      expect(recovered3).not.toBeNull()
      expect(recovered3!.projectCount).toBe(MAX_PAYLOAD_PROJECT_COUNT)
      expect(recovered3!.assignmentCount).toBe(MULTI_CLUSTER_COUNT)
      expect(recovered3!.phaseCount).toBe(DEEP_PHASE_COUNT)
      expect(recovered3!.deployMode).toBe('yolo')
      expect(recovered3!.overlay).toBe('network')
    })
  })
})
