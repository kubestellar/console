/// <reference types='@testing-library/jest-dom/vitest' />
import type React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import '../../test/utils/setupMocks'

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

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn() },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { SyncDialog } from './SyncDialog'

describe('SyncDialog Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        })
      )
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('renders without crashing when open', () => {
    expect(() =>
      render(<SyncDialog {...defaultProps} />)
    ).not.toThrow()
  })

  it('renders the app name in the dialog', () => {
    render(<SyncDialog {...defaultProps} />)
    expect(screen.getByText('GitOps Sync: test-app')).toBeInTheDocument()
  })
})
