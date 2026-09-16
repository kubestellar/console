import { test, expect } from '@playwright/test'
import {
  DIALOG_TIMEOUT_MS,
  MC_STORAGE_KEY,
  STRESS_PROJECTS,
  STRESS_CLUSTERS,
  STRESS_ASSIGNMENTS,
  STRESS_PHASES,
  navigateTo,
  seedAndOpenMC,
} from './helpers/mission-stress-setup'

// FIXME(#16080): All stress tests in this file consistently timeout in CI preview environment.
// The preview environment has resource constraints and EventSource MIME type errors that
// prevent these tests from passing. Tests are marked as fixme pending investigation of:
// - Preview environment resource limits
// - EventSource MIME type configuration
// - Test timeout tuning for CI environment

/**
 * Mission Control STRESS Tests — Pipeline
 *
 * 'Runbook → Fix Pipeline' + 'Full Pipeline Integration'.
 * Split from the original monolithic mission-control-stress.spec.ts (#23060).
 * Shared setup/mocks live in ./helpers/mission-stress-setup.ts.
 *
 * Modes:
 *   MOCK MODE (CI):  MOCK_AI=true npx playwright test e2e/mission-control-stress.*.spec.ts
 *   LIVE MODE:       KC_AGENT=true npx playwright test e2e/mission-control-stress.*.spec.ts --headed
 */

test.describe('Mission Control STRESS Tests', () => {
  test.describe.configure({ timeout: 120_000 })

  test.describe('Runbook → Fix Pipeline', () => {

    test('8. runbook evidence gathering — MCP endpoints respond to pod crash tools', async ({ page }) => {
      await navigateTo(page)

      // Test that the MCP endpoints the runbook executor would call all respond correctly
      // This validates the full API surface a pod-crash-investigation runbook needs

      // Step 1: get_events
      const eventsResp = await page.evaluate(async () => {
        const resp = await fetch('/api/mcp/ops/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
          body: JSON.stringify({ tool: 'get_events', args: { cluster: 'prod-us-east', namespace: 'production', limit: 20 } }),
        })
        return resp.json()
      })
      expect(eventsResp.events).toBeDefined()
      expect(eventsResp.events.length).toBeGreaterThanOrEqual(1)

      // Step 2: find_pod_issues
      const issuesResp = await page.evaluate(async () => {
        const resp = await fetch('/api/mcp/ops/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
          body: JSON.stringify({ tool: 'find_pod_issues', args: { cluster: 'prod-us-east', namespace: 'production' } }),
        })
        return resp.json()
      })
      expect(issuesResp.issues).toBeDefined()
      expect(issuesResp.issues.length).toBeGreaterThanOrEqual(1)

      // Step 3: gadget trace (optional step)
      const traceResp = await page.evaluate(async () => {
        const resp = await fetch('/api/gadget/trace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
          body: JSON.stringify({ tool: 'trace_exec', args: { cluster: 'prod-us-east', namespace: 'production' } }),
        })
        return resp.json()
      })
      expect(traceResp.isError).toBe(false)
      expect(traceResp.result).toBeDefined()
    })

    test('9. runbook → mission control pipeline — evidence feeds fixer description', async ({ page }) => {

      // Simulate a runbook that completed and now feeds into Mission Control
      const runbookEvidence = `
## Pod Crash Investigation Results

### Events
- BackOff: Back-off restarting failed container (47 times)
- OOMKilled: Container exceeded 512Mi memory limit (12 times)

### Pod Issues
- api-server-7f84b9c-x2k9f: CrashLoopBackOff, 47 restarts, OOMKilled
- worker-5c8b4d-j3k2m: Pending, Unschedulable (Insufficient cpu)

### Root Cause Analysis
Memory limit too low (512Mi) for api-server workload. Needs resource limit increase
and Prometheus monitoring to track memory usage over time.
`

      // Seed Mission Control with the runbook evidence as the description
      await seedAndOpenMC(page, {
        phase: 'define',
        description: `Runbook investigation found: ${runbookEvidence}\n\nGoal: Deploy monitoring and fix resource limits to prevent OOM crashes`,
        title: 'Fix: OOM Crash Loop + Monitoring Gap',
        projects: [
          { name: 'prometheus', displayName: 'Prometheus', reason: 'Memory usage monitoring to detect OOM before it happens', category: 'Observability', priority: 'required' as const, dependencies: ['helm'] },
          { name: 'grafana', displayName: 'Grafana', reason: 'Visualize memory trends and set up alert dashboards', category: 'Observability', priority: 'recommended' as const, dependencies: ['prometheus'] },
          { name: 'kyverno', displayName: 'Kyverno', reason: 'Policy to enforce minimum memory limits on all pods', category: 'Security', priority: 'recommended' as const, dependencies: ['cert-manager'] },
        ],
      })

      // Verify the runbook evidence is visible in the description
      const bodyText = await page.textContent('body')
      expect(bodyText).toMatch(/OOMKilled|CrashLoopBackOff|512Mi/i)
      expect(bodyText).toMatch(/prometheus/i)
      expect(bodyText).toMatch(/grafana|kyverno/i)

      await page.screenshot({ path: 'test-results/stress-runbook-to-fixer.png', fullPage: true })
    })

    test('10. all 5 runbook MCP tool endpoints — every tool the runbooks call responds', async ({ page }) => {
      await navigateTo(page)

      // Test every MCP/Gadget tool that the 5 built-in runbooks call
      // Pod crash: get_events, find_pod_issues, trace_exec
      // Node not ready: get_warning_events, get_cluster_health, get_pods
      // DNS failure: get_pods (kube-system), get_warning_events, trace_dns
      // Cluster unreachable: get_cluster_health, get_events
      // Memory pressure: get_cluster_health, find_pod_issues, get_warning_events

      const tools = ['get_events', 'find_pod_issues', 'get_cluster_health', 'get_warning_events', 'get_pods']
      const results: Record<string, boolean> = {}

      for (const tool of tools) {
        const resp = await page.evaluate(async (toolName) => {
          const resp = await fetch('/api/mcp/ops/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
            body: JSON.stringify({ tool: toolName, args: { cluster: 'prod-us-east', limit: 20 } }),
          })
          return { ok: resp.ok, status: resp.status }
        }, tool)
        results[tool] = resp.ok
      }

      // Also test gadget tools
      for (const gadgetTool of ['trace_exec', 'trace_dns']) {
        const resp = await page.evaluate(async (toolName) => {
          const resp = await fetch('/api/gadget/trace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
            body: JSON.stringify({ tool: toolName, args: { cluster: 'prod-us-east' } }),
          })
          return { ok: resp.ok, status: resp.status }
        }, gadgetTool)
        results[gadgetTool] = resp.ok
      }

      // All 7 tools should respond 200 (mocked)
      for (const [_tool, ok] of Object.entries(results)) {
        expect(ok).toBe(true)
      }
    })
  })
  test.describe('Full Pipeline Integration', () => {

    test('16. complete wizard flow — blueprint phase with 15 projects across 5 clusters', async ({ page }) => {
      // Seed directly to Phase 3 (blueprint) with the full payload
      // This tests the most complex rendering: SVG blueprint with
      // 15 projects, 5 clusters, 6 phases, and dependency edges
      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Full platform: security, observability, GitOps, serverless, multi-cloud',
        title: 'Full Platform Stack',
        projects: STRESS_PROJECTS,
        assignments: STRESS_ASSIGNMENTS,
        phases: STRESS_PHASES,
        deployMode: 'phased',
      })

      const bodyText = await page.textContent('body')

      // Verify clusters are present in the blueprint
      let clusterMatches = 0
      for (const cluster of STRESS_CLUSTERS) {
        if (bodyText?.match(new RegExp(cluster.name, 'i'))) clusterMatches++
      }
      expect(clusterMatches).toBeGreaterThanOrEqual(3)

      // Verify phase names are present
      let phaseMatches = 0
      for (const phase of STRESS_PHASES) {
        if (bodyText?.match(new RegExp(phase.name, 'i'))) phaseMatches++
      }
      expect(phaseMatches).toBeGreaterThanOrEqual(3)

      await page.screenshot({ path: 'test-results/stress-full-pipeline.png', fullPage: true })
    })

    test('17. concurrent state operations — rapid project add/remove/swap stress', async ({ page }) => {
      await navigateTo(page)

      // Test that rapid state mutations don't corrupt the state
      const finalState = await page.evaluate(async (key) => {
        // Simulate rapid state changes like a user frantically clicking
        const BASE_PROJECTS = [
          { name: 'prometheus', displayName: 'Prometheus', reason: 'Metrics', category: 'Observability', priority: 'required', dependencies: [] },
          { name: 'grafana', displayName: 'Grafana', reason: 'Dashboards', category: 'Observability', priority: 'required', dependencies: ['prometheus'] },
        ]

        // Rapid write/read cycle
        const ITERATIONS = 50
        for (let i = 0; i < ITERATIONS; i++) {
          const projects = [...BASE_PROJECTS]
          // Add a project
          projects.push({
            name: `stress-project-${i}`,
            displayName: `Stress ${i}`,
            reason: `Stress test iteration ${i}`,
            category: 'Test',
            priority: 'optional',
            dependencies: [],
          })

          localStorage.setItem(key, JSON.stringify({
            state: {
              phase: 'define',
              description: `Iteration ${i}`,
              title: 'Stress',
              projects,
              assignments: [],
              phases: [],
              overlay: 'architecture',
              deployMode: 'phased',
              aiStreaming: false,
              launchProgress: [],
            },
            savedAt: Date.now(),
          }))

          // Immediately read back
          const raw = localStorage.getItem(key)
          if (!raw) return { error: `Lost state at iteration ${i}` }
          try {
            const parsed = JSON.parse(raw)
            if ((parsed.state || parsed).projects.length < 2) {
              return { error: `Corrupted at iteration ${i}` }
            }
          } catch (error) { console.error('Error:', error)
            return { error: `Parse failed at iteration ${i }` }
          }
        }

        // Read final state
        const final = JSON.parse(localStorage.getItem(key) || '{}')
        const state = final.state || final
        return {
          projectCount: state.projects?.length || 0,
          description: state.description,
          iterations: ITERATIONS,
        }
      }, MC_STORAGE_KEY)

      expect(finalState).not.toHaveProperty('error')
      expect(finalState.projectCount).toBeGreaterThanOrEqual(2)
      expect(finalState.iterations).toBe(50)
    })

    test('18. overlay toggle stress — rapid switching between 5 visualization modes', async ({ page }) => {
      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Overlay toggle stress',
        title: 'Overlay Test',
        projects: STRESS_PROJECTS.slice(0, 6),
        assignments: [STRESS_ASSIGNMENTS[0], STRESS_ASSIGNMENTS[1]],
        phases: STRESS_PHASES.slice(0, 3),
      })

      const bpTab = page.getByText(/blueprint|flight/i).first()
      if (await bpTab.isVisible({ timeout: 3000 }).catch((error) => { console.error('Promise error:', error); return false })) await bpTab.click()
      // Wait for blueprint SVG to render
      await expect(page.locator('svg:not([class*="lucide"]):not([width="24"])').first()).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

      const overlays = ['architecture', 'compute', 'storage', 'network', 'security']
      for (const overlay of overlays) {
        const btn = page.getByText(new RegExp(overlay, 'i')).first()
        if (await btn.isVisible({ timeout: 2000 }).catch((error) => { console.error('Promise error:', error); return false })) {
          await btn.click()
          // Wait for SVG to re-render after overlay toggle
          await expect(page.locator('svg:not([class*="lucide"]):not([width="24"])').first()).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
        }
      }

      // After cycling all overlays, page should still render correctly
      const svg = page.locator('svg:not([class*="lucide"]):not([width="24"])').first()
      const svgVisible = await svg.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })
      expect(svgVisible).toBe(true)

      await page.screenshot({ path: 'test-results/stress-overlay-toggle.png', fullPage: true })
    })
  })
})
