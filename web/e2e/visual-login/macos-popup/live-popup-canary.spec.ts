import { expect, test, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  assertLiveDashboardShell,
  dismissOptionalLiveOverlays,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
} from '../helpers/liveSiteAssertions'
import { firstVisibleLocator } from '../helpers/visualLoginAssertions'

type PopupControl = {
  name: string
  required: boolean
  locators: (page: Page) => Locator[]
  afterClick?: (page: Page, trigger: Locator) => Promise<void>
}

type PopupDifference = {
  classification: 'safari-z-index' | 'macos-popup-clipped' | 'macos-top-layer-hidden'
  browser: string
  route: string
  control: string
  reason: string
  screenshotPath?: string
  expectedTopLayer?: string
  actualTopLayer?: string
  details?: Record<string, unknown>
}

type PopupFact = {
  browser: string
  route: string
  control: string
  skipped?: boolean
  skipReason?: string
  triggerBox?: Box | null
  popupBox?: Box | null
  viewport: { width: number; height: number }
  popup?: ElementSummary | null
  samples: Array<{
    name: string
    x: number
    y: number
    topmost: ElementSummary | null
    hitWithinPopup: boolean
  }>
  clippingEdges: string[]
  nearestClippingAncestor: (ElementSummary & { box: Box | null; overflow: string; overflowX: string; overflowY: string }) | null
  clippedByAncestor: boolean
  topLayerPass: boolean
  position?: string
  zIndex?: string
  screenshotPath?: string
}

type Box = {
  x: number
  y: number
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

type ElementSummary = {
  tagName: string
  id: string
  className: string
  role: string
  text: string
  testId: string
}

const ROUTE = '/'
const REPORT_DIR = path.resolve(process.cwd(), 'test-results/reports/macos-popup')
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots')
const REPORT_PATH = path.join(REPORT_DIR, 'macos-popup-matrix.json')

const controls: PopupControl[] = [
  {
    name: 'user-menu',
    required: true,
    locators: page => [
      page.getByRole('button', { name: /daviddiaz0317|live-canary|user|account|profile/i }),
      page.locator('button[aria-label*="user" i]'),
      page.locator('button[aria-label*="account" i]'),
      page.locator('button[aria-label*="profile" i]'),
      page.locator('[data-testid*="user" i] button'),
    ],
  },
  {
    name: 'search',
    required: true,
    locators: page => [
      page.getByRole('textbox', { name: /search/i }),
      page.locator('input[placeholder*="Search" i]'),
      page.getByRole('button', { name: /search/i }),
      page.locator('button[aria-label*="search" i]'),
    ],
    afterClick: async (page, trigger) => {
      const tagName = await trigger.evaluate(element => element.tagName.toLowerCase()).catch(() => '')
      if (tagName === 'input' || tagName === 'textarea') {
        await trigger.fill('cluster')
      } else {
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K').catch(() => undefined)
        await page.keyboard.type('cluster').catch(() => undefined)
      }
    },
  },
  {
    name: 'filter-panel',
    required: true,
    locators: page => [
      page.getByRole('button', { name: /filter/i }),
      page.locator('button[aria-label*="filter" i]'),
      page.locator('button[title*="filter" i]'),
    ],
  },
  {
    name: 'alerts-popover',
    required: false,
    locators: page => [
      page.getByRole('button', { name: /alert|notification|critical issue/i }),
      page.locator('button[aria-label*="alert" i]'),
      page.locator('button[aria-label*="notification" i]'),
      page.locator('button[title*="alert" i]'),
      page.locator('button[title*="notification" i]'),
    ],
  },
  {
    name: 'ai-missions-panel',
    required: false,
    locators: page => [
      page.getByRole('button', { name: /ai missions/i }),
      page.getByText(/AI Missions/i),
      page.locator('[aria-label*="AI Missions" i]'),
    ],
  },
  {
    name: 'card-settings-menu',
    required: false,
    locators: page => [
      page.getByRole('button', { name: /settings|configure|customize/i }),
      page.locator('button[aria-label*="settings" i]'),
      page.locator('button[title*="settings" i]'),
      page.locator('[data-testid*="settings" i] button'),
    ],
  },
]

test.describe('macOS WebKit live popup canary', () => {
  test.skip(process.env.LIVE_SITE_TESTS !== 'true', 'LIVE_SITE_TESTS=true is required for macOS live popup checks')

  test('live popups stay top-layer on macOS WebKit @live-site @macos-popup @invariant:macos-popup-top-layer-stable', async ({ page, browserName }, testInfo) => {
    const baseUrl = liveCanaryUrl()
    expect(baseUrl, 'LIVE_CANARY_CONSOLE_URL or SELF_HOSTED_CONSOLE_URL must point at the live canary').toBeTruthy()
    if (!baseUrl) return

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await establishLiveCanarySession(page, baseUrl)
    await gotoLiveCanaryRoute(page, baseUrl, ROUTE)
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page)
    await page.waitForTimeout(1_500)

    const facts: PopupFact[] = []
    const differences: PopupDifference[] = []

    for (const control of controls) {
      await clearTransientUi(page)
      const trigger = await firstVisibleLocator(page, control.locators(page), control.required ? 8_000 : 2_000)
      if (!trigger) {
        const skippedFact: PopupFact = {
          browser: browserName,
          route: ROUTE,
          control: control.name,
          skipped: true,
          skipReason: control.required ? 'required trigger not visible' : 'optional trigger not visible',
          viewport: page.viewportSize() || { width: 0, height: 0 },
          samples: [],
          clippingEdges: [],
          nearestClippingAncestor: null,
          clippedByAncestor: false,
          topLayerPass: false,
        }
        facts.push(skippedFact)
        if (control.required) {
          differences.push({
            classification: 'macos-top-layer-hidden',
            browser: browserName,
            route: ROUTE,
            control: control.name,
            reason: 'required popup trigger was not visible or clickable',
            details: skippedFact,
          })
        }
        continue
      }

      let triggerBox: Box | null = null
      try {
        await expect(trigger, `${control.name} trigger must be visible`).toBeVisible()
        await trigger.click({ trial: true })
        triggerBox = normalizeBox(await trigger.boundingBox())
        await trigger.click()
        await control.afterClick?.(page, trigger)
        await page.waitForTimeout(600)
      } catch (error) {
        const screenshotPath = path.join(SCREENSHOT_DIR, `${control.name}-trigger-failed.png`)
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined)
        const failureFact: PopupFact = {
          browser: browserName,
          route: ROUTE,
          control: control.name,
          triggerBox,
          viewport: page.viewportSize() || { width: 0, height: 0 },
          samples: [],
          clippingEdges: [],
          nearestClippingAncestor: null,
          clippedByAncestor: false,
          topLayerPass: false,
          screenshotPath: path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/'),
        }
        facts.push(failureFact)
        differences.push({
          classification: 'macos-top-layer-hidden',
          browser: browserName,
          route: ROUTE,
          control: control.name,
          reason: `popup trigger was visible but not clickable: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
          screenshotPath: failureFact.screenshotPath,
          details: failureFact as unknown as Record<string, unknown>,
        })
        continue
      }

      if (process.env.MACOS_POPUP_LITMUS_FORCE_FAILURE === 'true') {
        await injectPopupLitmusFailure(page)
        await page.waitForTimeout(100)
      }

      const screenshotPath = path.join(SCREENSHOT_DIR, `${control.name}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false })
      await testInfo.attach(`${control.name}-macos-popup`, {
        path: screenshotPath,
        contentType: 'image/png',
      }).catch(() => undefined)

      const fact = await collectPopupFact(page, {
        browser: browserName,
        route: ROUTE,
        control: control.name,
        triggerBox,
        screenshotPath: path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/'),
      })
      facts.push(fact)
      differences.push(...differencesFromFact(fact))
    }

    if (process.env.MACOS_POPUP_LITMUS_FORCE_FAILURE === 'true' && differences.length === 0) {
      differences.push({
        classification: 'macos-top-layer-hidden',
        browser: browserName,
        route: ROUTE,
        control: 'litmus',
        reason: 'litmus mode was enabled but no popup/top-layer detector fired',
      })
    }

    const classification = classifyDifferences(differences)
    const report = {
      kind: 'macos-popup-matrix',
      browser: browserName,
      projectName: testInfo.project.name,
      route: ROUTE,
      url: page.url(),
      litmusMode: process.env.MACOS_POPUP_LITMUS_FORCE_FAILURE === 'true',
      classification,
      facts,
      differences,
    }
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
    await testInfo.attach('macos-popup-matrix', {
      path: REPORT_PATH,
      contentType: 'application/json',
    }).catch(() => undefined)

    expect(differences, 'macOS WebKit popups must be visible, unclipped, and top-layer dominant').toEqual([])
  })
})

async function clearTransientUi(page: Page) {
  await removePopupLitmusFailure(page)
  await page.keyboard.press('Escape').catch(() => undefined)
  await page.mouse.click(8, 8).catch(() => undefined)
  await page.waitForTimeout(250)
}

async function injectPopupLitmusFailure(page: Page) {
  await removePopupLitmusFailure(page)
  const handle = await page.addStyleTag({
    content: `
      body::after {
        content: "";
        position: fixed;
        inset: 0 0 auto 0;
        height: 260px;
        z-index: 2147483647;
        pointer-events: auto;
        background: rgba(255, 0, 0, 0.01);
      }

      [role="menu"],
      [role="dialog"],
      [role="listbox"],
      [aria-modal="true"],
      [data-radix-popper-content-wrapper],
      [data-radix-dialog-content],
      [cmdk-root] {
        z-index: 1 !important;
      }
    `,
  })
  await handle.evaluate(element => {
    element.id = 'macos-popup-litmus-style'
  })
}

async function removePopupLitmusFailure(page: Page) {
  await page.evaluate(() => document.getElementById('macos-popup-litmus-style')?.remove()).catch(() => undefined)
}

function normalizeBox(box: Awaited<ReturnType<Locator['boundingBox']>>): Box | null {
  if (!box) return null
  return {
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(box.height),
    top: round(box.y),
    right: round(box.x + box.width),
    bottom: round(box.y + box.height),
    left: round(box.x),
  }
}

async function collectPopupFact(
  page: Page,
  input: Pick<PopupFact, 'browser' | 'route' | 'control' | 'triggerBox' | 'screenshotPath'>,
): Promise<PopupFact> {
  return page.evaluate(({ browser, route, control, triggerBox, screenshotPath }) => {
    type Box = {
      x: number
      y: number
      width: number
      height: number
      top: number
      right: number
      bottom: number
      left: number
    }
    type ElementSummary = {
      tagName: string
      id: string
      className: string
      role: string
      text: string
      testId: string
    }

    function roundValue(value: number) {
      return Math.round(value * 100) / 100
    }

    function boxFromRect(rect: DOMRect | null): Box | null {
      if (!rect) return null
      return {
        x: roundValue(rect.x),
        y: roundValue(rect.y),
        width: roundValue(rect.width),
        height: roundValue(rect.height),
        top: roundValue(rect.top),
        right: roundValue(rect.right),
        bottom: roundValue(rect.bottom),
        left: roundValue(rect.left),
      }
    }

    function summarize(element: Element | null): ElementSummary | null {
      if (!element) return null
      const htmlElement = element as HTMLElement
      return {
        tagName: htmlElement.tagName.toLowerCase(),
        id: htmlElement.id || '',
        className: String(htmlElement.getAttribute('class') || '').slice(0, 180),
        role: htmlElement.getAttribute('role') || '',
        text: (htmlElement.innerText || htmlElement.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        testId: htmlElement.getAttribute('data-testid') || '',
      }
    }

    function isVisible(element: Element) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 10
        && rect.height > 10
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
    }

    function isPopupCandidate(element: Element) {
      const htmlElement = element as HTMLElement
      const role = htmlElement.getAttribute('role') || ''
      const ariaModal = htmlElement.getAttribute('aria-modal') || ''
      const className = String(htmlElement.getAttribute('class') || '').toLowerCase()
      const testId = String(htmlElement.getAttribute('data-testid') || '').toLowerCase()
      const attributes = htmlElement.getAttributeNames().join(' ').toLowerCase()
      return [
        'menu',
        'dialog',
        'listbox',
        'tooltip',
      ].includes(role)
        || ariaModal === 'true'
        || className.includes('popover')
        || className.includes('dropdown')
        || className.includes('menu')
        || className.includes('modal')
        || className.includes('command')
        || testId.includes('popover')
        || testId.includes('dropdown')
        || attributes.includes('radix-popper')
        || attributes.includes('radix-dialog')
        || attributes.includes('cmdk')
    }

    const allCandidates = Array.from(document.body.querySelectorAll('*'))
      .filter(element => isPopupCandidate(element) && isVisible(element))
      .map(element => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        const zIndex = Number.parseInt(style.zIndex, 10)
        return {
          element,
          rect,
          area: rect.width * rect.height,
          zIndex: Number.isFinite(zIndex) ? zIndex : 0,
        }
      })
      .filter(candidate => candidate.area >= 120)
      .sort((left, right) => {
        if (right.zIndex !== left.zIndex) return right.zIndex - left.zIndex
        return right.area - left.area
      })
    const popup = allCandidates[0]?.element || null
    const popupRect = popup ? popup.getBoundingClientRect() : null
    const popupBox = boxFromRect(popupRect)
    const style = popup ? window.getComputedStyle(popup) : null
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const clippingEdges: string[] = []
    if (popupBox) {
      if (popupBox.left < -1) clippingEdges.push('left')
      if (popupBox.top < -1) clippingEdges.push('top')
      if (popupBox.right > viewport.width + 1) clippingEdges.push('right')
      if (popupBox.bottom > viewport.height + 1) clippingEdges.push('bottom')
    }

    let nearestClippingAncestor: (ElementSummary & { box: Box | null; overflow: string; overflowX: string; overflowY: string }) | null = null
    let clippedByAncestor = false
    if (popup && popupBox) {
      let parent = popup.parentElement
      while (parent) {
        const ancestorStyle = window.getComputedStyle(parent)
        const overflow = `${ancestorStyle.overflow} ${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`
        if (/(hidden|clip|auto|scroll)/i.test(overflow)) {
          const ancestorBox = boxFromRect(parent.getBoundingClientRect())
          nearestClippingAncestor = {
            ...(summarize(parent) as ElementSummary),
            box: ancestorBox,
            overflow: ancestorStyle.overflow,
            overflowX: ancestorStyle.overflowX,
            overflowY: ancestorStyle.overflowY,
          }
          if (ancestorBox) {
            clippedByAncestor = popupBox.left < ancestorBox.left - 1
              || popupBox.top < ancestorBox.top - 1
              || popupBox.right > ancestorBox.right + 1
              || popupBox.bottom > ancestorBox.bottom + 1
          }
          break
        }
        parent = parent.parentElement
      }
    }

    const samples = popupBox
      ? [
          { name: 'center', x: popupBox.left + popupBox.width / 2, y: popupBox.top + popupBox.height / 2 },
          { name: 'top-middle', x: popupBox.left + popupBox.width / 2, y: popupBox.top + Math.min(18, popupBox.height / 2) },
          { name: 'bottom-middle', x: popupBox.left + popupBox.width / 2, y: popupBox.bottom - Math.min(18, popupBox.height / 2) },
          { name: 'left-middle', x: popupBox.left + Math.min(18, popupBox.width / 2), y: popupBox.top + popupBox.height / 2 },
          { name: 'right-middle', x: popupBox.right - Math.min(18, popupBox.width / 2), y: popupBox.top + popupBox.height / 2 },
        ].map(sample => {
          const x = Math.min(Math.max(sample.x, 0), viewport.width - 1)
          const y = Math.min(Math.max(sample.y, 0), viewport.height - 1)
          const topmost = document.elementFromPoint(x, y)
          return {
            name: sample.name,
            x: roundValue(x),
            y: roundValue(y),
            topmost: summarize(topmost),
            hitWithinPopup: Boolean(popup && topmost && (topmost === popup || popup.contains(topmost))),
          }
        })
      : []

    return {
      browser,
      route,
      control,
      triggerBox,
      popupBox,
      viewport,
      popup: summarize(popup),
      samples,
      clippingEdges,
      nearestClippingAncestor,
      clippedByAncestor,
      topLayerPass: samples.length > 0 && samples.every(sample => sample.hitWithinPopup),
      position: style?.position,
      zIndex: style?.zIndex,
      screenshotPath,
    }
  }, input)
}

function differencesFromFact(fact: PopupFact): PopupDifference[] {
  const differences: PopupDifference[] = []
  if (!fact.popup || !fact.popupBox) {
    differences.push({
      classification: 'macos-top-layer-hidden',
      browser: fact.browser,
      route: fact.route,
      control: fact.control,
      reason: 'popup did not become visible after the trigger was clicked',
      screenshotPath: fact.screenshotPath,
      details: fact as unknown as Record<string, unknown>,
    })
    return differences
  }

  if (fact.clippingEdges.length > 0 || fact.clippedByAncestor) {
    differences.push({
      classification: 'macos-popup-clipped',
      browser: fact.browser,
      route: fact.route,
      control: fact.control,
      reason: fact.clippedByAncestor
        ? `popup is clipped by ancestor ${describeElement(fact.nearestClippingAncestor)}`
        : `popup extends outside viewport edges: ${fact.clippingEdges.join(', ')}`,
      screenshotPath: fact.screenshotPath,
      details: fact as unknown as Record<string, unknown>,
    })
  }

  if (!fact.topLayerPass) {
    const failedSample = fact.samples.find(sample => !sample.hitWithinPopup)
    differences.push({
      classification: 'safari-z-index',
      browser: fact.browser,
      route: fact.route,
      control: fact.control,
      reason: `popup is not top-layer dominant at sample ${failedSample?.name || 'unknown'}`,
      screenshotPath: fact.screenshotPath,
      expectedTopLayer: describeElement(fact.popup),
      actualTopLayer: describeElement(failedSample?.topmost || null),
      details: fact as unknown as Record<string, unknown>,
    })
  }

  return differences
}

function classifyDifferences(differences: PopupDifference[]) {
  if (differences.some(difference => difference.classification === 'safari-z-index')) return 'safari-z-index'
  if (differences.some(difference => difference.classification === 'macos-popup-clipped')) return 'macos-popup-clipped'
  if (differences.some(difference => difference.classification === 'macos-top-layer-hidden')) return 'macos-top-layer-hidden'
  return 'passed'
}

function describeElement(element: ElementSummary | null | undefined) {
  if (!element) return 'none'
  const id = element.id ? `#${element.id}` : ''
  const role = element.role ? `[role="${element.role}"]` : ''
  const testId = element.testId ? `[data-testid="${element.testId}"]` : ''
  const text = element.text ? ` "${element.text.slice(0, 48)}"` : ''
  return `${element.tagName}${id}${role}${testId}${text}`.trim()
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
