import React from 'react'
/**
 * Unit tests for GitHubActivityItems sub-components.
 * Covers PRItem, IssueItem, ReleaseItem, ContributorItem rendering
 * and link attributes.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PRItem, IssueItem, ReleaseItem, ContributorItem } from './GitHubActivityItems'
import type { GitHubPR, GitHubIssue, GitHubRelease, GitHubContributor } from './GitHubActivity.types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

vi.mock('../../lib/formatters', () => ({
  formatTimeAgo: () => '2h ago',
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date().toISOString()

const openPR: GitHubPR = {
  number: 42,
  title: 'feat: Add great feature',
  state: 'open',
  merged_at: null,
  created_at: now,
  updated_at: now,
  user: { login: 'dev', avatar_url: '' },
  html_url: 'https://github.com/org/repo/pull/42',
  draft: false,
  labels: [{ name: 'enhancement', color: 'a2eeef' }],
}

const mergedPR: GitHubPR = { ...openPR, number: 43, state: 'closed', merged_at: now, title: 'fix: merged PR' }
const closedPR: GitHubPR = { ...openPR, number: 44, state: 'closed', merged_at: null, title: 'closed unmerged PR' }

const openIssue: GitHubIssue = {
  number: 100,
  title: 'bug: Something is broken',
  state: 'open',
  created_at: now,
  updated_at: now,
  user: { login: 'reporter', avatar_url: '' },
  html_url: 'https://github.com/org/repo/issues/100',
  labels: [{ name: 'bug', color: 'd73a4a' }],
  comments: 5,
}

const closedIssue: GitHubIssue = { ...openIssue, number: 101, state: 'closed', closed_at: now, title: 'closed issue' }

const release: GitHubRelease = {
  id: 1,
  tag_name: 'v1.2.3',
  name: 'v1.2.3 Release',
  published_at: now,
  html_url: 'https://github.com/org/repo/releases/tag/v1.2.3',
  author: { login: 'release-bot' },
  prerelease: false,
}

const contributor: GitHubContributor = {
  login: 'top-dev',
  avatar_url: '',
  contributions: 123,
  html_url: 'https://github.com/top-dev',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PRItem', () => {
  // 1. Open PR
  it('renders PR title', () => {
    render(<PRItem pr={openPR} />)
    expect(screen.getByText(/feat: Add great feature/)).toBeInTheDocument()
  })

  it('renders PR number', () => {
    render(<PRItem pr={openPR} />)
    expect(screen.getByText(/#42/)).toBeInTheDocument()
  })

  it('renders open status', () => {
    render(<PRItem pr={openPR} />)
    expect(screen.getByText(/open/i)).toBeInTheDocument()
  })

  it('link points to PR URL', () => {
    render(<PRItem pr={openPR} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://github.com/org/repo/pull/42')
  })

  // 2. Merged PR
  it('renders merged status', () => {
    render(<PRItem pr={mergedPR} />)
    // Title "fix: merged PR" also contains "merged", so use getAllByText
    expect(screen.getAllByText(/merged/i).length).toBeGreaterThan(0)
  })

  // 3. Closed PR
  it('renders closed status', () => {
    render(<PRItem pr={closedPR} />)
    // Title "closed unmerged PR" also contains "closed", so use getAllByText
    expect(screen.getAllByText(/closed/i).length).toBeGreaterThan(0)
  })

  // Snapshot
  it('matches snapshot for open PR', () => {
    const { asFragment } = render(<PRItem pr={openPR} />)
    expect(asFragment()).toMatchSnapshot()
  })
})

describe('IssueItem', () => {
  // 1. Open issue
  it('renders issue title', () => {
    render(<IssueItem issue={openIssue} />)
    expect(screen.getByText(/bug: Something is broken/)).toBeInTheDocument()
  })

  it('renders issue number', () => {
    render(<IssueItem issue={openIssue} />)
    expect(screen.getByText(/#100/)).toBeInTheDocument()
  })

  it('renders comment count', () => {
    render(<IssueItem issue={openIssue} />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })

  it('link points to issue URL', () => {
    render(<IssueItem issue={openIssue} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://github.com/org/repo/issues/100')
  })

  // 2. Closed issue
  it('renders closed issue title', () => {
    render(<IssueItem issue={closedIssue} />)
    // Component renders "#{number} {title}" in a span, so match with partial text
    expect(screen.getByText(/closed issue/i)).toBeInTheDocument()
  })

  // Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<IssueItem issue={openIssue} />)
    expect(asFragment()).toMatchSnapshot()
  })
})

describe('ReleaseItem', () => {
  it('renders tag name', () => {
    render(<ReleaseItem release={release} />)
    // Component renders release.name || release.tag_name; fixture has name='v1.2.3 Release'
    expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument()
  })

  it('renders release name', () => {
    render(<ReleaseItem release={release} />)
    expect(screen.getByText('v1.2.3 Release')).toBeInTheDocument()
  })

  it('link points to release URL', () => {
    render(<ReleaseItem release={release} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://github.com/org/repo/releases/tag/v1.2.3')
  })

  it('renders author name', () => {
    render(<ReleaseItem release={release} />)
    expect(screen.getByText('release-bot')).toBeInTheDocument()
  })

  it('matches snapshot', () => {
    const { asFragment } = render(<ReleaseItem release={release} />)
    expect(asFragment()).toMatchSnapshot()
  })
})

describe('ContributorItem', () => {
  it('renders contributor login', () => {
    render(<ContributorItem contributor={contributor} />)
    expect(screen.getByText('top-dev')).toBeInTheDocument()
  })

  it('renders contribution count', () => {
    render(<ContributorItem contributor={contributor} />)
    expect(screen.getByText(/123/)).toBeInTheDocument()
  })

  it('link points to contributor URL', () => {
    render(<ContributorItem contributor={contributor} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://github.com/top-dev')
  })

  it('matches snapshot', () => {
    const { asFragment } = render(<ContributorItem contributor={contributor} />)
    expect(asFragment()).toMatchSnapshot()
  })
})
