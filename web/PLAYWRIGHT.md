# Playwright E2E Testing for KubeStellar Console

This document describes the comprehensive Playwright testing suite for the KubeStellar Console (ksc).

## Quick Start

```bash
# Run all tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run in headed mode (see the browser)
npm run test:e2e:headed

# Run specific browser
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit

# View test report
npm run test:e2e:report
```

## Test Structure

```
e2e/
├── auth.setup.ts           # Authentication setup (runs first)
├── fixtures.ts             # Custom test fixtures and helpers
├── Login.spec.ts           # Login/authentication tests
├── Dashboard.spec.ts       # Dashboard page tests
├── AIMode.spec.ts          # AI mode settings tests
├── AIRecommendations.spec.ts # AI card recommendation tests
├── CardChat.spec.ts        # Card chat AI interaction tests
├── CardSharing.spec.ts     # Card sharing/export tests
├── Clusters.spec.ts        # Clusters page tests
├── Events.spec.ts          # Events page tests
├── Settings.spec.ts        # Settings page tests
└── DrillDown.spec.ts       # Drilldown modal tests
```

## Test Coverage Areas

### 1. Authentication & Authorization
- Login flow (dev mode and OAuth)
- Protected route redirection
- Session persistence
- Logout functionality

### 2. AI Interactivity
- **AI Mode Settings**: Low/Medium/High mode switching
- **Card Recommendations**: Priority-based suggestions based on cluster state
- **Card Chat**: Natural language interaction with cards
- **Token Usage**: Tracking and limits

### 3. Dashboard & Cards
- Card rendering and data loading
- Card management (add, remove, configure)
- Card templates
- Card sharing and export
- Dashboard import/export

### 4. Cluster Management
- Cluster list and health status
- Cluster detail drilldown
- GPU node information
- Pod and deployment issues

### 5. Events & Activity
- Event streaming and filtering
- Warning-only mode
- Auto-refresh functionality
- Event detail view

### 6. Sharing & Collaboration
- Individual card sharing
- Dashboard sharing
- Export to JSON
- Import from shared links

## API Mocking

Tests use MSW (Mock Service Worker) for API mocking. Mock handlers are defined in:
- `src/mocks/handlers.ts` - Default handlers
- `src/mocks/browser.ts` - Browser worker setup

### Available Scenarios

```typescript
// In your test:
await page.evaluate(() => {
  window.__msw?.applyScenario('manyIssues')  // Triggers AI recommendations
  window.__msw?.applyScenario('highGPUUsage')
  window.__msw?.applyScenario('cleanCluster')
  window.__msw?.applyScenario('mcpUnavailable')
})
```

## Custom Fixtures

Use the custom fixtures in `e2e/fixtures.ts` for common operations:

```typescript
import { test, testData } from './fixtures'

test('example with fixtures', async ({ page, aiMode, mockAPI }) => {
  // Set AI mode
  await aiMode.setHigh()

  // Mock API responses
  await mockAPI.mockClusters(testData.clusters.healthy)
  await mockAPI.mockPodIssues(testData.podIssues.many)

  await page.goto('/')
  // ... assertions
})
```

## Running in CI

Tests run automatically in GitHub Actions on:
- Push to `main` or `dev` branches
- Pull requests to `main` or `dev`

CI Configuration:
- 3 browsers (Chromium, Firefox, WebKit)
- 2 shards per browser (6 parallel jobs)
- Mobile browser tests (Chrome, Safari)
- Accessibility tests
- Visual regression tests (PRs only)

### CI Artifacts

After CI runs, you can download:
- `playwright-report` - HTML test report
- `mobile-test-report` - Mobile browser results
- `visual-diff` - Visual regression screenshots (if failed)

## Writing New Tests

### Best Practices

1. **Use data-testid attributes** for stable selectors:
   ```typescript
   await page.locator('[data-testid="cluster-card"]').click()
   ```

2. **Wait for elements properly**:
   ```typescript
   await page.waitForLoadState('domcontentloaded')
   await expect(element).toBeVisible({ timeout: 5000 })
   ```

3. **Handle conditional UI gracefully**:
   ```typescript
   const hasButton = await button.isVisible().catch(() => false)
   if (hasButton) {
     await button.click()
   }
   ```

4. **Mock APIs for predictable state**:
   ```typescript
   await page.route('**/api/mcp/clusters', (route) =>
     route.fulfill({ json: { clusters: mockData } })
   )
   ```

5. **Clean up after tests**:
   ```typescript
   test.afterEach(async ({ page }) => {
     await page.evaluate(() => localStorage.clear())
   })
   ```

### Test Template

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feature')
    await page.waitForLoadState('domcontentloaded')
  })

  test.describe('Subsection', () => {
    test('should do something', async ({ page }) => {
      // Arrange
      await page.route('**/api/endpoint', (route) =>
        route.fulfill({ json: { data: 'mock' } })
      )

      // Act
      await page.click('[data-testid="action-button"]')

      // Assert
      await expect(page.locator('[data-testid="result"]')).toBeVisible()
    })
  })
})
```

## Debugging Tests

```bash
# Run with debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test Dashboard.spec.ts

# Run specific test
npx playwright test -g "displays dashboard with sidebar"

# Generate new test
npx playwright codegen http://localhost:5173
```

## Troubleshooting

### Tests fail with timeout
- Increase timeout in `playwright.config.ts`
- Check if dev server is running
- Verify API mocks are set up correctly

### Flaky tests
- Add `await page.waitForTimeout(500)` strategically
- Use `expect().toBeVisible({ timeout: X })` with longer timeouts
- Check for race conditions in async operations

### Screenshots/Videos
On failure, find in `test-results/`:
- Screenshots: `test-results/*/test-failed-*.png`
- Videos: `test-results/*/video.webm`
- Traces: `test-results/*/trace.zip`

## Contributing

1. Add tests for all new features
2. Ensure tests pass locally before pushing
3. Update this document for new test patterns
4. Aim for 80%+ test coverage on critical paths
