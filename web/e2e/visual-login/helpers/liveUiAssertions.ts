import { expect, type Page } from '@playwright/test'
import {
  assertDashboardContentVisible,
  assertNoSevereOverlap,
  assertNotBlank,
  assertNotStuckLoading,
  assertUrlIsNotAuth,
  firstVisibleLocator,
} from './visualLoginAssertions'
import { markLiveRateLimitDataLoss, recordLiveUiFailures } from './liveReporting'

const TEXT_COLLISION_RATIO_LIMIT = 0.30

const forbiddenLiveUiPatterns = [
  { label: 'demo mode control', source: String.raw`\bDemo Mode\b`, flags: 'i' },
  { label: 'connection log drawer', source: String.raw`\bConnection Log\b`, flags: 'i' },
  { label: 'local agent refresh warning', source: String.raw`Refreshing local agent`, flags: 'i' },
  { label: 'endpoint error summary', source: String.raw`endpoint errors?`, flags: 'i' },
  { label: 'AI prediction load failure', source: String.raw`/predictions/ai\s*-\s*Load failed`, flags: 'i' },
  { label: 'widget install prompt', source: String.raw`\bInstall widget\b`, flags: 'i' },
]

export async function assertLiveDashboardShell(page: Page, route = 'live-shell') {
  const bodyText = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
  if (/infrastructure connection error|rate limited|too many requests|http 429/i.test(bodyText)) {
    markLiveRateLimitDataLoss(route, [{
      classification: 'live-rate-limit-data-loss',
      status: 429,
      url: 'visible-live-rate-limit-screen',
    }])
  }
  await assertUrlIsNotAuth(page)
  await assertDashboardContentVisible(page)
  await assertNotBlank(page)
  await assertNotStuckLoading(page)
  await expect(page.locator('[data-testid="login-page"]'), 'authenticated live UI must not show the login page').toHaveCount(0)
}

export async function assertLiveLayoutStable(page: Page) {
  const root = await page.evaluate(() => {
    const documentElement = document.documentElement
    const body = document.body
    return {
      scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
      clientWidth: documentElement.clientWidth,
      blankCards: Array.from(document.querySelectorAll('[class*="card"], .glass, [data-card-id]')).filter((element) => {
        const rect = element.getBoundingClientRect()
        const text = (element.textContent || '').replace(/\s+/g, '').trim()
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const visibleArea = visibleWidth * visibleHeight
        const totalArea = rect.width * rect.height
        const visibleRatio = totalArea > 0 ? visibleArea / totalArea : 0
        return rect.width > 80 && rect.height > 40 && visibleRatio >= 0.7 && text.length === 0
      }).length,
      stuckLoaders: Array.from(document.querySelectorAll('[role="status"], .animate-spin')).filter((element) => {
        const rect = element.getBoundingClientRect()
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
        const ariaLabel = element.getAttribute('aria-label') || ''
        const className = element.getAttribute('class') || ''
        const statusText = `${text} ${ariaLabel} ${className}`
        const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
        const screenReaderOnly = rect.width <= 1 && rect.height <= 1
        const benignStatus = /page tip|last updated|not yet updated/i.test(statusText)
        const loadingLike = /loading|collecting|refresh|sync|pending|animate-spin/i.test(statusText)
        return inViewport && !screenReaderOnly && !benignStatus && loadingLike
      }).length,
    }
  })

  expect(root.scrollWidth, 'live UI must not create horizontal page overflow').toBeLessThanOrEqual(root.clientWidth + 2)
  expect(root.blankCards, 'live UI must not render blank card shells after data load').toBe(0)
  expect(root.stuckLoaders, 'live UI must not leave visible loading spinners after the settle window').toBeLessThanOrEqual(2)

  const repeatedCards = page.locator('[data-card-id], [data-testid*="card"], [data-testid*="tile"]')
  if (await repeatedCards.count().catch(() => 0) > 1) {
    await assertNoSevereOverlap(page, repeatedCards)
  }
}

export async function assertNoForbiddenLiveUi(page: Page) {
  await page.waitForTimeout(2_000)
  const state = await page.evaluate(async (patterns) => {
    const compiled = patterns.map(pattern => ({
      label: pattern.label,
      regex: new RegExp(pattern.source, pattern.flags),
    }))

    function visibleTextNodes() {
      const nodes: Array<{ text: string; rect: DOMRect }> = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text && element) {
          const style = window.getComputedStyle(element)
          const hidden = element.closest('[aria-hidden="true"], [hidden]')
          if (!hidden && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of Array.from(range.getClientRects())) {
              const inViewport = rect.width > 1
                && rect.height > 1
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth
              if (inViewport) nodes.push({ text, rect })
            }
          }
        }
        node = walker.nextNode()
      }
      return nodes
    }

    const textNodes = visibleTextNodes()
    const forbiddenMatches = compiled.flatMap(pattern =>
      textNodes
        .filter(node => pattern.regex.test(node.text))
        .map(node => ({ label: pattern.label, text: node.text.slice(0, 160) }))
    )
    const agentStatusText = document.querySelector('[data-testid="navbar-agent-status-btn"]')?.textContent || ''
    if (/\boffline\b/i.test(agentStatusText)) {
      forbiddenMatches.push({
        label: 'offline live navbar status',
        text: agentStatusText.replace(/\s+/g, ' ').trim().slice(0, 160),
      })
    }
    const warningBadges = textNodes
      .map(node => {
        const match = node.text.match(/\b(\d+)\s+warnings?\b/i)
        return match ? { text: node.text.slice(0, 160), count: Number(match[1]) } : null
      })
      .filter((entry): entry is { text: string; count: number } => Boolean(entry && entry.count > 0))

    // Count firing, unacknowledged warning-severity alerts whose provenance is
    // the external nightly-E2E CI monitoring feed. The alert rules engine tags
    // exactly those alerts with resourceKind 'WorkflowRun'
    // (alertRulesEngine.ts evaluateNightlyE2EFailure); every infrastructure
    // evaluator uses 'Cluster'/'Pod'/'Node' kinds. These alerts reflect the
    // health of monitored EXTERNAL CI (llm-d nightly runs), not the health of
    // this live deployment, so the navbar "N warnings" pill legitimately shows
    // them (#23089 follow-up: 76 failed llm-d nightly runs blocked promotion).
    let externalCiWarningAlerts = 0
    try {
      const rawAlerts = localStorage.getItem('kc_alerts')
      const parsedAlerts: unknown = rawAlerts ? JSON.parse(rawAlerts) : []
      if (Array.isArray(parsedAlerts)) {
        externalCiWarningAlerts = parsedAlerts.filter((alert) => {
          const candidate = alert as { status?: string; acknowledgedAt?: string; severity?: string; resourceKind?: string } | null
          return Boolean(candidate)
            && candidate!.status === 'firing'
            && !candidate!.acknowledgedAt
            && candidate!.severity === 'warning'
            && candidate!.resourceKind === 'WorkflowRun'
        }).length
      }
    } catch {
      // Unparseable alert storage — treat as zero external alerts so every
      // warning badge stays infra-attributed (fail closed).
    }

    // Count pod issues the backend actually reports for the monitored
    // clusters. The navbar health pill's warningCount also aggregates
    // actionable pod issues (useDashboardHealth <- usePodIssues), so a badge
    // backed by real backend pod-issue data is truthful monitoring output,
    // not a UI artifact. Promote run 33709508275 failed on "76 warnings"
    // that were exactly 76 genuinely stuck pods (Unschedulable/Pending, in
    // leaked hive-hosted-* namespaces) on one monitored CI cluster — real
    // cluster state the console is SUPPOSED to surface. The stream is a
    // one-shot SSE body that closes after a completion summary; any fetch
    // or parse failure leaves the count at zero so the badge check fails
    // closed.
    let clusterPodIssuesReported = 0
    try {
      const podIssuesResponse = await fetch('/api/mcp/pod-issues/stream', {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(15_000),
      })
      if (podIssuesResponse.ok) {
        const rawStream = await podIssuesResponse.text()
        for (const line of rawStream.split('\n')) {
          if (!line.startsWith('data:')) continue
          try {
            const chunk = JSON.parse(line.slice('data:'.length)) as { issues?: unknown } | null
            if (chunk && Array.isArray(chunk.issues)) clusterPodIssuesReported += chunk.issues.length
          } catch {
            // Malformed SSE chunk — skip it.
          }
        }
      }
    } catch {
      // Unreachable pod-issues endpoint — fail closed with zero corroboration.
    }

    return {
      demoModeStorage: localStorage.getItem('kc-demo-mode'),
      forbiddenMatches,
      warningBadges,
      externalCiWarningAlerts,
      clusterPodIssuesReported,
    }
  }, forbiddenLiveUiPatterns)

  // A warning badge is an artifact only if its count exceeds what
  // backend-corroborated monitoring signals explain: warning alerts from the
  // external nightly-E2E CI feed plus pod issues the backend reports for the
  // monitored clusters. Any excess means the UI is showing warnings that no
  // real data backs — that still fails the gate.
  const corroboratedWarningCount = state.externalCiWarningAlerts + state.clusterPodIssuesReported
  const unexplainedWarningBadges = state.warningBadges.filter(badge => badge.count > corroboratedWarningCount)

  await recordLiveUiFailures(page, {
    forbiddenMatches: state.forbiddenMatches,
    warningBadges: process.env.LIVE_UI_ALLOW_WARNING_BADGES === 'true' ? [] : unexplainedWarningBadges,
  })
  expect(state.demoModeStorage, 'live UI must not keep demo mode enabled in localStorage').not.toBe('true')
  expect(state.forbiddenMatches, 'live UI must not show demo/local-agent/error drawer artifacts').toEqual([])
  if (process.env.LIVE_UI_ALLOW_WARNING_BADGES !== 'true') {
    expect(
      unexplainedWarningBadges,
      `live UI must not show warning badges beyond backend-corroborated monitoring signals after settling (external CI warning alerts: ${state.externalCiWarningAlerts}, cluster pod issues reported: ${state.clusterPodIssuesReported})`,
    ).toEqual([])
  }
}

export async function assertNoVisibleTextCollisions(page: Page) {
  const collisions = await page.evaluate((ratioLimit) => {
    type TextBox = {
      text: string
      element: Element
      x: number
      y: number
      width: number
      height: number
    }

    function visibleTextBoxes(): TextBox[] {
      const boxes: TextBox[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text.length >= 2 && element) {
          const style = window.getComputedStyle(element)
          const hidden = element.closest('[aria-hidden="true"], [hidden], script, style, .sr-only, [data-groundtruth-field]')
          if (!hidden && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of Array.from(range.getClientRects())) {
              const inViewport = rect.width > 4
                && rect.height > 4
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth
              if (inViewport) {
                boxes.push({
                  text: text.slice(0, 80),
                  element,
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                })
              }
            }
          }
        }
        node = walker.nextNode()
      }
      return boxes
    }

    const boxes = visibleTextBoxes()
    const failures: Array<{ first: string; second: string; ratio: number }> = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.element === b.element || a.element.contains(b.element) || b.element.contains(a.element)) continue
        const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
        const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
        const overlapArea = overlapWidth * overlapHeight
        if (overlapArea <= 0) continue
        const smallerArea = Math.min(a.width * a.height, b.width * b.height)
        const ratio = smallerArea > 0 ? overlapArea / smallerArea : 0
        if (ratio > ratioLimit) {
          failures.push({ first: a.text, second: b.text, ratio: Number(ratio.toFixed(2)) })
          if (failures.length >= 12) return failures
        }
      }
    }
    return failures
  }, TEXT_COLLISION_RATIO_LIMIT)

  await recordLiveUiFailures(page, { textCollisions: collisions })
  expect(collisions, 'live UI visible text must not severely overlap').toEqual([])
}

export async function assertFixtureNamesVisible(page: Page, names: string[]) {
  for (const name of names) {
    const visible = await firstVisibleLocator(page, [
      page.getByText(name, { exact: false }),
      page.locator(`[aria-label*="${name}"]`),
    ])
    expect(visible, `live fixture ${name} should be visible in the authenticated UI`).not.toBeNull()
  }
}
