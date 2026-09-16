import { type Page } from '@playwright/test'

/** Default clusters returned from a mocked MCP `**\/api/mcp/**` call */
export const DEFAULT_MCP_CLUSTERS = [
  { name: 'cluster-1', healthy: true, nodeCount: 5, podCount: 45 },
  { name: 'cluster-2', healthy: true, nodeCount: 3, podCount: 32 },
]

/** Options for `setupMCP` — override cluster/issue/event/node payloads */
export interface SetupMCPOptions {
  clusters?: unknown[]
  issues?: unknown[]
  events?: unknown[]
  nodes?: unknown[]
}

/**
 * Mock the generic MCP endpoints (`**\/api/mcp/**`) with a default payload
 * shape that matches what the dashboard cards expect. Accepts optional
 * overrides for clusters / issues / events / nodes so specs can tailor the
 * response without re-implementing the route handler.
 */
export async function setupMCP(page: Page, options?: SetupMCPOptions): Promise<void> {
  const clusters = options?.clusters ?? DEFAULT_MCP_CLUSTERS
  const issues = options?.issues ?? []
  const events = options?.events ?? []
  const nodes = options?.nodes ?? []

  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters,
        issues,
        events,
        nodes,
      }),
    })
  )
}
