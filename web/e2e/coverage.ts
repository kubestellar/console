import { test as base, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const coverageDir = path.join(process.cwd(), '.nyc_output')

// Generate unique ID without external dependency
function generateId(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
}

// Extend the base test to collect coverage
export const test = base.extend({
  page: async ({ page }, use) => {
    // Start collecting coverage
    await use(page)

    // After test, collect coverage if available
    if (process.env.VITE_COVERAGE === 'true') {
      const coverage = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__coverage__
      })

      if (coverage) {
        // Ensure coverage directory exists
        if (!fs.existsSync(coverageDir)) {
          fs.mkdirSync(coverageDir, { recursive: true })
        }

        // Write coverage data with unique filename
        const coverageFile = path.join(coverageDir, `coverage-${generateId()}.json`)
        fs.writeFileSync(coverageFile, JSON.stringify(coverage))
      }
    }
  },
})

export { expect }
