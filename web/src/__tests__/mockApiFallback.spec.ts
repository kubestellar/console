import { describe, expect, it } from 'vitest'

import { mockApiFallback, mockApiFallbackStrict } from '../../e2e/helpers/setup'

const STREAM_URL = 'http://localhost:5174/api/stellar/stream'
const OTHER_API_URL = 'http://localhost:5174/api/example'
const STREAM_PATTERN = '**/api/stellar/stream*'
const API_CATCH_ALL_PATTERN = '**/api/**'
const OK_STATUS = 200
const NOT_FOUND_STATUS = 404

type MockFulfillPayload = {
  status?: number
  contentType?: string
  body?: string
}

type MockRouteHandler = (route: {
  request: () => { url: () => string }
  fulfill: (payload: MockFulfillPayload) => Promise<void>
  fallback: () => Promise<void>
}) => Promise<void> | void

class MockPage {
  readonly routes: Array<{ pattern: string; handler: MockRouteHandler }> = []

  async route(pattern: string, handler: MockRouteHandler): Promise<void> {
    this.routes.push({ pattern, handler })
  }
}

function matchesRoute(pattern: string, url: string): boolean {
  if (pattern === STREAM_PATTERN) {
    return url.includes('/api/stellar/stream')
  }

  if (pattern === API_CATCH_ALL_PATTERN) {
    return url.includes('/api/')
  }

  return false
}

async function dispatchRoute(page: MockPage, url: string): Promise<MockFulfillPayload | null> {
  for (const { pattern, handler } of [...page.routes].reverse()) {
    if (!matchesRoute(pattern, url)) {
      continue
    }

    let fulfilled: MockFulfillPayload | null = null
    await handler({
      request: () => ({ url: () => url }),
      fulfill: async (payload) => {
        fulfilled = payload
      },
      fallback: async () => {},
    })

    if (fulfilled) {
      return fulfilled
    }
  }

  return null
}

describe('mockApiFallback SSE routing', () => {
  it('keeps stellar stream on text/event-stream in demo mode', async () => {
    const page = new MockPage()

    await mockApiFallback(page as never)

    const response = await dispatchRoute(page, STREAM_URL)

    expect(response).toMatchObject({
      status: OK_STATUS,
      contentType: 'text/event-stream',
      body: ': keep-alive\n\n',
    })
  })

  it('still uses the JSON catch-all for other api routes', async () => {
    const page = new MockPage()

    await mockApiFallback(page as never)

    const response = await dispatchRoute(page, OTHER_API_URL)

    expect(response).toMatchObject({
      status: OK_STATUS,
      contentType: 'application/json',
    })
  })

  it('keeps stellar stream on text/event-stream in strict mode', async () => {
    const page = new MockPage()

    await mockApiFallbackStrict(page as never)

    const response = await dispatchRoute(page, STREAM_URL)

    expect(response).toMatchObject({
      status: OK_STATUS,
      contentType: 'text/event-stream',
      body: ': keep-alive\n\n',
    })
  })

  it('still returns 404 for other strict-mode api routes', async () => {
    const page = new MockPage()

    await mockApiFallbackStrict(page as never)

    const response = await dispatchRoute(page, OTHER_API_URL)

    expect(response).toMatchObject({
      status: NOT_FOUND_STATUS,
      contentType: 'application/json',
    })
  })
})
