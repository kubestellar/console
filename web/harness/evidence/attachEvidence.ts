import type { Locator, Page, TestInfo } from '@playwright/test'
import { collectEvidence } from './collectEvidence'
import type { EvidenceCollectors } from './evidenceTypes'

export async function attachEvidenceOnFailure(options: {
  page: Page
  testInfo: TestInfo
  invariantIds: string[]
  collectors: EvidenceCollectors
  appMode: string
  boundingBoxes?: Array<{ label: string; locator: Locator }>
}) {
  if (options.testInfo.status === options.testInfo.expectedStatus) return
  const { evidencePath } = await collectEvidence(options)
  await options.testInfo.attach('sanitized-visual-login-evidence', {
    path: evidencePath,
    contentType: 'application/json',
  })
}
