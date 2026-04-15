/// <reference types='@testing-library/jest-dom/vitest' />
import type React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import '../../test/utils/setupMocks'

// Expected endpoint hit by the component. #7993 Phase 4 moved drift detection
// to kc-agent, so the component now fetches ${LOCAL_AGENT_HTTP_URL}/gitops/detect-drift.
// We match on the path suffix to stay agnostic of the exact agent host.
const DETECT_DRIFT_PATH_SUFFIX = '/gitops/detect-drift'
// Wait budget for async state transitions inside the component.
const ASYNC_WAIT_TIMEOUT_MS = 2000

vi.mock('../../lib/modals', () => {
  const BaseModal = Object.assign(
    ({ children }: { children: React.ReactNode }) => <div data-testid='mock-base-modal'>{children}</div>,
    {
      Header: ({ title }: { title: string }) => <div>{title}</div>,
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }
  )
  return { BaseModal }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { SyncDialog } from './SyncDialog'

type FetchMock = ReturnType<typeof vi.fn>

function makeFetchMock(impl: (url: string) => Promise<Response>): FetchMock {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    return impl(url)
  }) as FetchMock
}

function mockResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('SyncDialog Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    appName: 'test-app',
    namespace: 'default',
    cluster: 'test-cluster',
    repoUrl: 'https://github.com/test/repo',
    path: 'deploy/',
    onSyncComplete: vi.fn(),
  }

  let fetchMock: FetchMock

  beforeEach(() => {
    fetchMock = makeFetchMock(() =>
      Promise.resolve(mockResponse({ drifted: false, resources: [] }))
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders without crashing when open', () => {
    expect(() => render(<SyncDialog {...defaultProps} />)).not.toThrow()
  })

  it('renders the app name in the dialog', () => {
    render(<SyncDialog {...defaultProps} />)
    expect(screen.getByText('GitOps Sync: test-app')).toBeInTheDocument()
  })

  // #6159 — substantive integration test: calls the real fetch endpoint the
  // component actually uses (NOT `api.post`). Updated for #7993 Phase 4:
  // the component now targets kc-agent's /gitops/detect-drift route.
  it('calls kc-agent /gitops/detect-drift via fetch on open (success path)', async () => {
    render(<SyncDialog {...defaultProps} />)
    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalled()
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain(DETECT_DRIFT_PATH_SUFFIX)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.repoUrl).toBe(defaultProps.repoUrl)
    expect(body.namespace).toBe(defaultProps.namespace)
    expect(body.cluster).toBe(defaultProps.cluster)
  })

  // #6159 — error path: backend returns non-ok; component must surface the
  // error, not silently swallow it.
  it('renders error state when drift detection fails', async () => {
    fetchMock = makeFetchMock(() =>
      Promise.resolve(
        mockResponse({ error: 'boom: backend down' }, false)
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<SyncDialog {...defaultProps} />)
    await waitFor(
      () => {
        expect(screen.getByText(/boom: backend down/)).toBeInTheDocument()
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
  })

  // #6159 — drift-detected path: response with resources transitions the
  // dialog into the plan phase and renders the drifted resources.
  it('transitions to plan phase and lists drifted resources', async () => {
    fetchMock = makeFetchMock(() =>
      Promise.resolve(
        mockResponse({
          drifted: true,
          resources: [
            {
              kind: 'Deployment',
              name: 'frontend',
              namespace: 'default',
              field: 'replicas',
              gitValue: '3',
              clusterValue: '5',
            },
          ],
        })
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<SyncDialog {...defaultProps} />)
    await waitFor(
      () => {
        expect(screen.getByText(/frontend/)).toBeInTheDocument()
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
    expect(screen.getByText(/Drift Detected/)).toBeInTheDocument()
  })
})
