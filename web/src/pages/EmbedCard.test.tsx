/**
 * EmbedCard.test.tsx — Vitest RTL tests (Issue #15737, Part of #4189).
 *
 * This file tests:
 * - Valid card query params (slugs mapping to components)
 * - Unknown/invalid card query params rendering a safe fallback
 * - Missing card query param rendering fallback gracefully
 * - Valid repo query param mapping to PipelineFilterProvider initialRepo
 * - Malformed repo query param mapping to null to prevent crash
 * - Embed footer/label containing expected metadata
 * - isDemoData mode showing a demo badge
 * - Main container filling screen with correct classes (no sidebar/chrome)
 *
 * Run from web/:
 *   npx vitest run src/pages/EmbedCard.test.tsx
 */
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { EmbedCard } from './EmbedCard'
import { useDemoMode } from '../hooks/useDemoMode'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'embed.unknownCard') return 'Card not found'
      if (key === 'embed.supportedCards') return 'Supported cards'
      return key
    },
  }),
}))

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false }))
vi.mock('../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

const mockPipelineFilterProvider = vi.fn()
vi.mock('../components/cards/pipelines/PipelineFilterContext', () => ({
  PipelineFilterProvider: ({ children, initialRepo }: { children: ReactNode; initialRepo?: string | null }) => {
    mockPipelineFilterProvider({ initialRepo })
    return <div data-testid="pipeline-filter-provider">{children}</div>
  },
}))

vi.mock('../components/cards/pipelines/NightlyReleasePulse', () => ({
  NightlyReleasePulse: () => {
    const { isDemoMode } = useDemoMode()
    return (
      <div data-testid="nightly-release-pulse-card">
        {isDemoMode && <span data-testid="demo-badge">Demo</span>}
      </div>
    )
  },
}))

vi.mock('../components/cards/pipelines/WorkflowMatrix', () => ({
  WorkflowMatrix: () => <div data-testid="workflow-matrix-card" />,
}))

vi.mock('../components/cards/pipelines/PipelineFlow', () => ({
  PipelineFlow: () => <div data-testid="pipeline-flow-card" />,
}))

vi.mock('../components/cards/pipelines/RecentFailures', () => ({
  RecentFailures: () => <div data-testid="recent-failures-card" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RenderEmbedOptions {
  cardType?: string
  searchQuery?: string
}

function renderEmbed({ cardType = '', searchQuery = '' }: RenderEmbedOptions = {}) {
  const basePath = cardType ? `/embed/${cardType}` : '/embed'
  const initialEntry = `${basePath}${searchQuery ? `?${searchQuery}` : ''}`
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/embed" element={<EmbedCard />} />
        <Route path="/embed/:cardType" element={<EmbedCard />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmbedCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  // ---- Scenario 1: Valid card query parameters ----

  describe('valid card query parameters', () => {
    const cases = [
      { slug: 'nightly-release-pulse', testId: 'nightly-release-pulse-card' },
      { slug: 'workflow-matrix', testId: 'workflow-matrix-card' },
      { slug: 'pipeline-flow', testId: 'pipeline-flow-card' },
      { slug: 'recent-failures', testId: 'recent-failures-card' },
    ]

    cases.forEach(({ slug, testId }) => {
      it(`renders the correct card component for valid slug: "${slug}"`, () => {
        renderEmbed({ cardType: slug })
        expect(screen.getByTestId(testId)).toBeInTheDocument()
      })
    })
  })

  // ---- Scenario 2 & 3: Unknown / Missing card parameters ----

  describe('error handling / unknown slugs', () => {
    it('renders a safe "Card not found" fallback when cardType is invalid', () => {
      renderEmbed({ cardType: 'invalid-card' })

      expect(screen.getByText('Card not found')).toBeInTheDocument()
      expect(screen.getByText(/Supported cards/)).toBeInTheDocument()
      
      ;[
        'nightly-release-pulse',
        'workflow-matrix',
        'pipeline-flow',
        'recent-failures',
      ].forEach((slug) => {
        expect(screen.getByText(new RegExp(slug))).toBeInTheDocument()
      })

      // Asserts that no card components are rendered
      expect(screen.queryByTestId('nightly-release-pulse-card')).not.toBeInTheDocument()
    })

    it('renders a fallback gracefully when cardType query param is missing', () => {
      renderEmbed()

      expect(screen.getByText('Card not found')).toBeInTheDocument()
      expect(screen.queryByTestId('nightly-release-pulse-card')).not.toBeInTheDocument()
    })
  })

  // ---- Scenario 4 & 5: Repo parameter validation ----

  describe('repo query parameter validation', () => {
    it('passes valid repo query param to PipelineFilterProvider', () => {
      renderEmbed({ cardType: 'nightly-release-pulse', searchQuery: 'repo=kubestellar/console' })

      expect(mockPipelineFilterProvider).toHaveBeenCalledWith(
        expect.objectContaining({ initialRepo: 'kubestellar/console' }),
      )
    })

    it('passes null to PipelineFilterProvider when repo format is malformed (missing owner)', () => {
      renderEmbed({ cardType: 'nightly-release-pulse', searchQuery: 'repo=console' })

      expect(mockPipelineFilterProvider).toHaveBeenCalledWith(
        expect.objectContaining({ initialRepo: null }),
      )
    })

    it('passes null to PipelineFilterProvider when repo query param is empty', () => {
      renderEmbed({ cardType: 'nightly-release-pulse', searchQuery: 'repo=' })

      expect(mockPipelineFilterProvider).toHaveBeenCalledWith(
        expect.objectContaining({ initialRepo: null }),
      )
    })

    it('passes null to PipelineFilterProvider when repo format has too many components', () => {
      renderEmbed({ cardType: 'nightly-release-pulse', searchQuery: 'repo=kubestellar/console/extra' })

      expect(mockPipelineFilterProvider).toHaveBeenCalledWith(
        expect.objectContaining({ initialRepo: null }),
      )
    })
  })

  // ---- Scenario 6: Embed footer/label ----

  describe('footer and label rendering', () => {
    it('renders correct card label and branding text in footer', () => {
      renderEmbed({ cardType: 'nightly-release-pulse' })

      expect(screen.getByText('Nightly Release Pulse')).toBeInTheDocument()
      const brandingLink = screen.getByRole('link', { name: 'KubeStellar Console' })
      expect(brandingLink).toBeInTheDocument()
      expect(brandingLink).toHaveAttribute('href', 'https://console.kubestellar.io')
    })

    it('appends repo name to card label in footer when repo param is valid', () => {
      renderEmbed({ cardType: 'workflow-matrix', searchQuery: 'repo=owner/repo' })

      expect(screen.getByText('Workflow Matrix — owner/repo')).toBeInTheDocument()
    })

    it('does not append repo name to card label when repo is invalid/malformed', () => {
      renderEmbed({ cardType: 'workflow-matrix', searchQuery: 'repo=malformed' })

      expect(screen.getByText('Workflow Matrix')).toBeInTheDocument()
      expect(screen.queryByText(/— malformed/)).not.toBeInTheDocument()
    })
  })

  // ---- Scenario 7: Demo badge in embed mode ----

  describe('demo mode in embed context', () => {
    it('displays the demo badge when isDemoMode is active', () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true })
      renderEmbed({ cardType: 'nightly-release-pulse' })

      expect(screen.getByTestId('demo-badge')).toBeInTheDocument()
      expect(screen.getByText('Demo')).toBeInTheDocument()
    })

    it('does not display demo badge when isDemoMode is disabled', () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: false })
      renderEmbed({ cardType: 'nightly-release-pulse' })

      expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument()
    })
  })

  // ---- Scenario 8: Layout and full-screen constraints ----

  describe('embed container layout constraints', () => {
    it('fills viewport completely (h-screen w-screen flex flex-col overflow-hidden) without navigation bars', () => {
      renderEmbed({ cardType: 'nightly-release-pulse' })

      const outerContainer = document.querySelector('div.h-screen')
      expect(outerContainer).toBeTruthy()
      expect(outerContainer?.className).toContain('w-screen')
      expect(outerContainer?.className).toContain('flex')
      expect(outerContainer?.className).toContain('flex-col')
      expect(outerContainer?.className).toContain('overflow-hidden')
    })
  })
})
