import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  PRItem,
  IssueItem,
  ReleaseItem,
  ContributorItem,
  GitHubActivityItemSkeleton,
} from '../GitHubActivityItems'
import type {
  GitHubPR,
  GitHubIssue,
  GitHubRelease,
  GitHubContributor,
} from '../GitHubActivity.types'

/* ---------- Mocks ---------- */

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({
    children,
    color,
  }: {
    children: React.ReactNode
    color?: string
  }) => (
    <span data-testid="status-badge" data-color={color}>
      {children}
    </span>
  ),
}))

/* ---------- Fixtures ---------- */

const FIXED_NOW = new Date('2026-06-01T12:00:00Z').getTime()
const RECENT = new Date(FIXED_NOW - 60 * 60 * 1000).toISOString() // 1 hour ago
const STALE = new Date(FIXED_NOW - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days ago

const BASE_PR: GitHubPR = {
  number: 42,
  title: 'Add cool feature',
  state: 'open',
  merged_at: null,
  created_at: RECENT,
  updated_at: RECENT,
  user: { login: 'octocat', avatar_url: 'https://example.com/a.png' },
  html_url: 'https://github.com/o/r/pull/42',
  draft: false,
  labels: [],
}

const BASE_ISSUE: GitHubIssue = {
  number: 7,
  title: 'Something broken',
  state: 'open',
  created_at: RECENT,
  updated_at: RECENT,
  user: { login: 'bugreporter', avatar_url: 'https://example.com/b.png' },
  html_url: 'https://github.com/o/r/issues/7',
  labels: [],
  comments: 3,
}

const BASE_RELEASE: GitHubRelease = {
  id: 1,
  tag_name: 'v1.2.3',
  name: 'Release 1.2.3',
  published_at: RECENT,
  html_url: 'https://github.com/o/r/releases/tag/v1.2.3',
  author: { login: 'releaser' },
  prerelease: false,
}

const BASE_CONTRIBUTOR: GitHubContributor = {
  login: 'contributor1',
  avatar_url: 'https://example.com/c.png',
  contributions: 128,
  html_url: 'https://github.com/contributor1',
}

/* ---------- Tests ---------- */

describe('GitHubActivityItems', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('PRItem', () => {
    it('renders open PR with title, number, and open badge', () => {
      render(<PRItem pr={BASE_PR} />)
      expect(screen.getByText(/#42 Add cool feature/)).toBeInTheDocument()
      expect(screen.getByText('cards:github.open')).toBeInTheDocument()
    })

    it('renders merged PR with merged badge and merged title', () => {
      render(
        <PRItem
          pr={{
            ...BASE_PR,
            state: 'closed',
            merged_at: RECENT,
          }}
        />
      )
      expect(screen.getByText('cards:github.merged')).toBeInTheDocument()
      expect(screen.getByTitle('cards:github.mergedPR')).toBeInTheDocument()
    })

    it('renders closed (unmerged) PR with closed badge', () => {
      render(
        <PRItem
          pr={{
            ...BASE_PR,
            state: 'closed',
            merged_at: null,
          }}
        />
      )
      expect(screen.getByText('cards:github.closed')).toBeInTheDocument()
      expect(screen.getByTitle('cards:github.closedPR')).toBeInTheDocument()
    })

    it('renders draft badge when PR is a draft', () => {
      render(<PRItem pr={{ ...BASE_PR, draft: true }} />)
      const badges = screen.getAllByTestId('status-badge')
      expect(
        badges.some((b) => b.textContent === 'cards:github.draft')
      ).toBe(true)
    })

    it('renders stale badge when open PR has not been updated in >14 days', () => {
      render(<PRItem pr={{ ...BASE_PR, updated_at: STALE }} />)
      const badges = screen.getAllByTestId('status-badge')
      expect(
        badges.some(
          (b) =>
            b.textContent === 'cards:github.stale' &&
            b.getAttribute('data-color') === 'yellow'
        )
      ).toBe(true)
    })

    it('does not render stale badge when PR is recent', () => {
      render(<PRItem pr={BASE_PR} />)
      const badges = screen.queryAllByTestId('status-badge')
      expect(
        badges.some((b) => b.textContent === 'cards:github.stale')
      ).toBe(false)
    })

    it('does not render stale badge when PR is closed even if old', () => {
      render(
        <PRItem
          pr={{
            ...BASE_PR,
            state: 'closed',
            merged_at: null,
            updated_at: STALE,
          }}
        />
      )
      const badges = screen.queryAllByTestId('status-badge')
      expect(
        badges.some((b) => b.textContent === 'cards:github.stale')
      ).toBe(false)
    })

    it('renders author login and avatar', () => {
      render(<PRItem pr={BASE_PR} />)
      expect(screen.getByText('octocat')).toBeInTheDocument()
      const avatar = screen.getByAltText('octocat') as HTMLImageElement
      expect(avatar.src).toBe('https://example.com/a.png')
    })

    it('sanitizes href — safe https URL is preserved', () => {
      const { container } = render(<PRItem pr={BASE_PR} />)
      const link = container.querySelector('a')!
      expect(link.getAttribute('href')).toBe('https://github.com/o/r/pull/42')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('sanitizes href — javascript: scheme is neutralized', () => {
      const { container } = render(
        <PRItem pr={{ ...BASE_PR, html_url: 'javascript:alert(1)' }} />
      )
      const link = container.querySelector('a')!
      expect(link.getAttribute('href')).not.toContain('javascript:')
    })
  })

  describe('IssueItem', () => {
    it('renders open issue with title and open badge', () => {
      render(<IssueItem issue={BASE_ISSUE} />)
      expect(screen.getByText(/#7 Something broken/)).toBeInTheDocument()
      expect(screen.getByText('cards:github.open')).toBeInTheDocument()
      expect(screen.getByTitle('cards:github.openIssue')).toBeInTheDocument()
    })

    it('renders closed issue with closed badge', () => {
      render(
        <IssueItem issue={{ ...BASE_ISSUE, state: 'closed' }} />
      )
      expect(screen.getByText('cards:github.closed')).toBeInTheDocument()
      expect(screen.getByTitle('cards:github.closedIssue')).toBeInTheDocument()
    })

    it('renders comment count when > 0', () => {
      render(<IssueItem issue={BASE_ISSUE} />)
      expect(screen.getByText(/3 cards:github.comments/)).toBeInTheDocument()
    })

    it('does not render comment count when 0', () => {
      render(<IssueItem issue={{ ...BASE_ISSUE, comments: 0 }} />)
      expect(
        screen.queryByText(/cards:github.comments/)
      ).not.toBeInTheDocument()
    })

    it('renders stale badge for open issue not updated in >14 days', () => {
      render(<IssueItem issue={{ ...BASE_ISSUE, updated_at: STALE }} />)
      const badges = screen.getAllByTestId('status-badge')
      expect(
        badges.some((b) => b.textContent === 'cards:github.stale')
      ).toBe(true)
    })

    it('does not render stale badge for closed issue even if old', () => {
      render(
        <IssueItem
          issue={{
            ...BASE_ISSUE,
            state: 'closed',
            updated_at: STALE,
          }}
        />
      )
      const badges = screen.queryAllByTestId('status-badge')
      expect(
        badges.some((b) => b.textContent === 'cards:github.stale')
      ).toBe(false)
    })

    it('renders reporter login and avatar', () => {
      render(<IssueItem issue={BASE_ISSUE} />)
      expect(screen.getByText('bugreporter')).toBeInTheDocument()
      const avatar = screen.getByAltText('bugreporter') as HTMLImageElement
      expect(avatar.src).toBe('https://example.com/b.png')
    })
  })

  describe('ReleaseItem', () => {
    it('renders release name when provided', () => {
      render(<ReleaseItem release={BASE_RELEASE} />)
      expect(screen.getByText('Release 1.2.3')).toBeInTheDocument()
    })

    it('falls back to tag_name when name is empty', () => {
      render(
        <ReleaseItem release={{ ...BASE_RELEASE, name: '' }} />
      )
      expect(screen.getByText('v1.2.3')).toBeInTheDocument()
    })

    it('renders author login', () => {
      render(<ReleaseItem release={BASE_RELEASE} />)
      expect(screen.getByText('releaser')).toBeInTheDocument()
    })

    it('renders pre-release badge when prerelease is true', () => {
      render(
        <ReleaseItem release={{ ...BASE_RELEASE, prerelease: true }} />
      )
      const badges = screen.getAllByTestId('status-badge')
      expect(
        badges.some(
          (b) =>
            b.textContent === 'cards:github.preRelease' &&
            b.getAttribute('data-color') === 'orange'
        )
      ).toBe(true)
    })

    it('does not render pre-release badge for stable releases', () => {
      render(<ReleaseItem release={BASE_RELEASE} />)
      expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument()
    })

    it('sanitizes href — safe URL preserved, javascript: neutralized', () => {
      const { container, rerender } = render(
        <ReleaseItem release={BASE_RELEASE} />
      )
      expect(container.querySelector('a')!.getAttribute('href')).toBe(
        BASE_RELEASE.html_url
      )

      rerender(
        <ReleaseItem
          release={{ ...BASE_RELEASE, html_url: 'javascript:alert(1)' }}
        />
      )
      expect(
        container.querySelector('a')!.getAttribute('href')
      ).not.toContain('javascript:')
    })
  })

  describe('ContributorItem', () => {
    it('renders login and contribution count', () => {
      render(<ContributorItem contributor={BASE_CONTRIBUTOR} />)
      expect(screen.getByText('contributor1')).toBeInTheDocument()
      expect(
        screen.getByText(/128 cards:github.contributions/)
      ).toBeInTheDocument()
    })

    it('renders avatar with login as alt text', () => {
      render(<ContributorItem contributor={BASE_CONTRIBUTOR} />)
      const avatar = screen.getByAltText('contributor1') as HTMLImageElement
      expect(avatar.src).toBe('https://example.com/c.png')
    })

    it('renders link to contributor profile', () => {
      const { container } = render(
        <ContributorItem contributor={BASE_CONTRIBUTOR} />
      )
      const link = container.querySelector('a')!
      expect(link.getAttribute('href')).toBe(
        'https://github.com/contributor1'
      )
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })

  describe('GitHubActivityItemSkeleton', () => {
    it('renders three skeleton placeholders', () => {
      render(<GitHubActivityItemSkeleton />)
      expect(screen.getAllByTestId('skeleton')).toHaveLength(3)
    })
  })
})
