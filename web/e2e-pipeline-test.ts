/**
 * End-to-End Pipeline Test
 *
 * This script:
 * 1. Opens the Console UI feedback modal via Playwright (user already logged in)
 * 2. Fills in and submits a bug report through the UI
 * 3. The backend creates the GitHub issue automatically
 * 4. Comments /triage accepted to trigger Copilot automation
 * 5. Monitors the pipeline from both UI and GitHub perspectives
 * 6. Takes screenshots at each stage
 */
import { chromium } from '@playwright/test'
import { execSync } from 'child_process'

const SCREENSHOT_DIR = '/tmp/e2e-screenshots'
const CONSOLE_URL = 'http://localhost:5174'
const REPO = 'kubestellar/console'

function gh(cmd: string): string {
  try {
    return execSync(`unset GITHUB_TOKEN && gh ${cmd}`, {
      encoding: 'utf-8',
      timeout: 30000
    }).trim()
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string }
    console.error(`gh command failed: ${err.stderr?.substring(0, 200) || err.message}`)
    return ''
  }
}

async function screenshot(page: { screenshot: (opts: { path: string; fullPage: boolean }) => Promise<void>; url: () => string }, name: string) {
  const path = `${SCREENSHOT_DIR}/${name}.png`
  await page.screenshot({ path, fullPage: false })
  console.log(`  Screenshot: ${path}`)
  return path
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  execSync(`mkdir -p ${SCREENSHOT_DIR}`)
  console.log('=== End-to-End Pipeline Test ===\n')

  // Step 1: Connect to existing Chrome via CDP
  console.log('Step 1: Connecting to Chrome via CDP...')
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  if (!page) { console.error('No page found'); process.exit(1) }
  console.log(`  Connected to: ${page.url()}`)

  // Step 2: Navigate to Console
  console.log('\nStep 2: Opening Console...')
  await page.goto(CONSOLE_URL + '/compute')
  await page.waitForLoadState('domcontentloaded')
  await sleep(1000)
  await screenshot(page, '01-console-home')

  // Step 3: Open feedback modal
  console.log('\nStep 3: Opening feedback modal...')
  const feedbackBtn = page.locator('[data-tour="feedback"]')
  await feedbackBtn.click()
  await sleep(800)
  await screenshot(page, '02-feedback-modal-open')

  // Step 4: Fill in bug report
  console.log('\nStep 4: Filling in bug report...')
  const bugButton = page.locator('button:has-text("Bug Report")')
  await bugButton.click()
  await sleep(200)

  const bugTitle = 'Cluster status badge shows stale data after network reconnection'
  const bugDescription = `When a cluster temporarily loses network connectivity and then reconnects, the status badge continues showing "Unhealthy" (red) even though the cluster has recovered. The health check polling does not reset its failure counter after a successful reconnection.

Steps to Reproduce:
1. Navigate to the Compute page
2. Observe a healthy cluster showing green status
3. Simulate network interruption (disconnect VPN)
4. Wait for the cluster to show "Unhealthy" status
5. Reconnect the network
6. Observe the cluster status - it remains "Unhealthy" despite successful reconnection

Expected: Status resets to "Healthy" within one polling cycle after reconnection.
Actual: Status badge stays red/unhealthy indefinitely until a full page refresh.`

  // Use placeholder to target the modal's title input (not the search bar)
  await page.locator('input[placeholder*="Dashboard not loading"]').fill(bugTitle)
  await page.locator('textarea[placeholder*="Describe what happened"]').fill(bugDescription)
  await sleep(300)
  await screenshot(page, '03-bug-report-filled')

  // Step 5: Submit the bug report
  console.log('\nStep 5: Submitting bug report...')

  // Check if we have the real Submit button (authenticated) or Login to Submit (demo)
  const realSubmit = page.locator('button[type="submit"]:has-text("Submit")')
  const loginSubmit = page.locator('button:has-text("Login to Submit")')

  const isAuthenticated = await realSubmit.isVisible().catch(() => false)
  const needsLogin = await loginSubmit.isVisible().catch(() => false)

  let issueNumber = ''
  let issueUrl: string | undefined

  if (isAuthenticated) {
    console.log('  Authenticated! Submitting via UI...')
    await realSubmit.click()
    await sleep(3000) // Wait for submission
    await screenshot(page, '04-submission-result')

    // Check for success message
    const successMsg = page.locator('text=Request Submitted')
    const success = await successMsg.isVisible({ timeout: 5000 }).catch(() => false)

    if (success) {
      console.log('  Bug report submitted successfully via UI!')

      // Get the GitHub issue link from the success message
      const ghLink = page.locator('a:has-text("View on GitHub")')
      if (await ghLink.isVisible().catch(() => false)) {
        issueUrl = await ghLink.getAttribute('href') || ''
        const match = issueUrl.match(/\/issues\/(\d+)/)
        issueNumber = match ? match[1] : ''
        console.log(`  Issue created: #${issueNumber} (${issueUrl})`)
      }
      await screenshot(page, '05-submission-success')
    } else {
      console.log('  Submission may have failed, checking for error...')
      await screenshot(page, '04-submission-error')
    }

    // Wait for modal to auto-close
    await sleep(3000)
  }

  if (needsLogin || !issueNumber) {
    // Fallback: create issue via GitHub API
    console.log('  Creating issue via GitHub API (backend unavailable or demo mode)...')

    // Close modal first
    await page.keyboard.press('Escape')
    await sleep(300)
    await page.keyboard.press('Escape')
    await sleep(300)

    const createResult = gh(
      `issue create --repo ${REPO} ` +
      `--title "${bugTitle}" ` +
      `--body "$(cat <<'BODY'\n${bugDescription}\n\n---\n*Submitted via Console E2E test*\nBODY\n)" ` +
      `--label "bug" --label "ai-fix-requested" --label "needs-triage"`
    )

    issueUrl = createResult.match(/https:\/\/github\.com\/[^\s]+/)?.[0]
    issueNumber = issueUrl?.match(/\/issues\/(\d+)/)?.[1] || ''

    if (!issueNumber || !issueUrl) {
      console.error('  Failed to create issue via API either!')
      console.error('  Output:', createResult)
      await browser.close()
      process.exit(1)
    }
    console.log(`  Created issue #${issueNumber}: ${issueUrl}`)
  }

  // Step 6: View the issue on GitHub
  console.log(`\nStep 6: Viewing issue #${issueNumber} on GitHub...`)
  await page.goto(`https://github.com/${REPO}/issues/${issueNumber}`)
  await page.waitForLoadState('domcontentloaded')
  await sleep(2000)
  await screenshot(page, '06-github-issue')

  // Step 7: Trigger pipeline
  console.log('\nStep 7: Posting /triage accepted...')
  gh(`issue comment ${issueNumber} --repo ${REPO} --body "/triage accepted"`)
  console.log('  Comment posted')
  await sleep(3000)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await sleep(1000)
  await screenshot(page, '07-triage-posted')

  // Step 8: Monitor pipeline
  console.log('\nStep 8: Monitoring pipeline (checking every 10s for 2 min)...')

  for (let i = 0; i < 12; i++) {
    await sleep(10000)
    const json = gh(`issue view ${issueNumber} --repo ${REPO} --json labels,assignees`)
    if (!json) continue

    try {
      const issue = JSON.parse(json)
      const labels = issue.labels?.map((l: { name: string }) => l.name) || []
      const assignees = issue.assignees?.map((a: { login: string }) => a.login) || []

      console.log(`  [${new Date().toLocaleTimeString()}] Check ${i + 1}/12: Labels=[${labels.join(', ')}] Assignees=[${assignees.join(', ')}]`)

      const copilotAssigned = assignees.some((a: string) =>
        a.toLowerCase().includes('copilot') || a.includes('[bot]')
      )

      if (copilotAssigned || labels.includes('ai-processing')) {
        console.log(`  Pipeline active! ${copilotAssigned ? 'Copilot assigned.' : 'ai-processing label detected.'}`)
        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        await sleep(1000)
        await screenshot(page, `08-pipeline-active-check${i}`)
        if (copilotAssigned) break
      }
    } catch {
      // continue
    }
  }

  // Step 9: Wait for Copilot PR (check every 15s for 6 min)
  console.log('\nStep 9: Waiting for Copilot PR...')
  for (let i = 0; i < 24; i++) {
    await sleep(15000)

    // Search for PRs mentioning this issue
    const prSearch = gh(`pr list --repo ${REPO} --state open --json number,title,author,headRefName`)
    if (!prSearch) continue

    try {
      const prs = JSON.parse(prSearch)
      // Find copilot PRs created recently
      const copilotPR = prs.find((p: { author?: { login?: string }; title?: string }) =>
        p.author?.login?.toLowerCase().includes('copilot') ||
        p.author?.login?.includes('[bot]') ||
        p.title?.includes(`#${issueNumber}`)
      )

      if (copilotPR) {
        console.log(`  Found Copilot PR #${copilotPR.number}: ${copilotPR.title}`)

        // View the PR
        await page.goto(`https://github.com/${REPO}/pull/${copilotPR.number}`)
        await page.waitForLoadState('domcontentloaded')
        await sleep(2000)
        await screenshot(page, '09-copilot-pr')

        // Step 10: Check Console UI
        console.log('\nStep 10: Checking Console UI for status updates...')
        await page.goto(CONSOLE_URL + '/compute')
        await page.waitForLoadState('domcontentloaded')
        await sleep(1000)

        // Open feedback modal > Updates tab
        await page.locator('[data-tour="feedback"]').click()
        await sleep(500)
        await page.locator('button:has-text("Updates")').click()
        await sleep(1000)
        await screenshot(page, '10-console-updates')

        // Activity tab
        const activityTab = page.locator('button:has-text("Activity")')
        if (await activityTab.isVisible().catch(() => false)) {
          await activityTab.click()
          await sleep(500)
          await screenshot(page, '11-console-activity')
        }

        console.log('\n=== Pipeline Test Complete ===')
        console.log(`Issue: #${issueNumber} (https://github.com/${REPO}/issues/${issueNumber})`)
        console.log(`PR: #${copilotPR.number} (https://github.com/${REPO}/pull/${copilotPR.number})`)
        console.log(`Screenshots: ${SCREENSHOT_DIR}/`)
        await browser.close()
        return
      }
    } catch { /* continue */ }

    console.log(`  [${new Date().toLocaleTimeString()}] No PR yet (${i + 1}/24)`)

    // Periodic GitHub refresh for visual
    if (i % 4 === 3) {
      await page.goto(`https://github.com/${REPO}/issues/${issueNumber}`)
      await page.waitForLoadState('domcontentloaded')
      await sleep(1000)
      await screenshot(page, `09-waiting-check${i}`)
    }
  }

  console.log('\nPR not created within monitoring window.')
  console.log(`Check manually: https://github.com/${REPO}/issues/${issueNumber}`)
  await page.goto(`https://github.com/${REPO}/issues/${issueNumber}`)
  await page.waitForLoadState('domcontentloaded')
  await screenshot(page, '99-final-state')
  await browser.close()
}

main().catch(e => {
  console.error('Test failed:', e)
  process.exit(1)
})
