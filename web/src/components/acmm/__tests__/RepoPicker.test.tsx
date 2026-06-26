import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockShowToast = vi.hoisted(() => vi.fn())
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const mockSetRepo = vi.hoisted(() => vi.fn())
const mockOpenIntro = vi.hoisted(() => vi.fn())
const mockForceRefetch = vi.hoisted(() => vi.fn())

function makeMockACMM(overrides: Record<string, unknown> = {}) {
  return {
    repo: 'kubestellar/console',
    setRepo: mockSetRepo,
    recentRepos: [],
    clearRepo: vi.fn(),
    scan: {
      data: { detectedIds: [], scannedAt: '' },
      level: { level: 1, levelName: 'Assisted' },
      isLoading: false,
      isRefreshing: false,
      error: null,
      forceRefetch: mockForceRefetch,
    },
    introOpen: false,
    openIntro: mockOpenIntro,
    closeIntro: vi.fn(),
    targetLevel: 1,
    setTargetLevel: vi.fn(),
    ...overrides,
  }
}

vi.mock('../ACMMProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ACMMProvider')>()
  return {
    ...actual,
    useACMM: () => makeMockACMM(),
    DEFAULT_REPO: 'kubestellar/console',
    normalizeRepoInput: actual.normalizeRepoInput,
  }
})

// Mock heavy acmm sources to avoid loading hundreds of criteria
vi.mock('../../../lib/acmm/sources', () => ({
  ALL_CRITERIA: Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`,
    source: i < 5 ? 'acmm' : 'fullsend',
    level: 1,
    name: `Criterion ${i}`,
    scannable: true,
  })),
}))

import { RepoPicker } from '../RepoPicker'

function renderPicker() {
  return render(<RepoPicker />)
}

describe('RepoPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('renders the repo input', () => {
    renderPicker()
    expect(
      screen.getByRole('combobox', { name: /github repository/i }),
    ).toBeInTheDocument()
  })

  it('shows the current repo value in the input', () => {
    renderPicker()
    expect(screen.getByRole('combobox', { name: /github repository/i })).toHaveValue(
      'kubestellar/console',
    )
  })

  it('renders the Scan button', () => {
    renderPicker()
    expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument()
  })

  it('renders the Load Console example button', () => {
    renderPicker()
    expect(
      screen.getByRole('button', { name: /load console example/i }),
    ).toBeInTheDocument()
  })

  it('renders the Get badge button', () => {
    renderPicker()
    expect(
      screen.getByRole('button', { name: /get badge/i }),
    ).toBeInTheDocument()
  })

  it('renders the Share button', () => {
    renderPicker()
    expect(
      screen.getByRole('button', { name: /share/i }),
    ).toBeInTheDocument()
  })

  it('renders the refresh button', () => {
    renderPicker()
    expect(screen.getByTitle(/re-scan/i)).toBeInTheDocument()
  })

  it('renders the "What is ACMM?" info button', () => {
    renderPicker()
    expect(screen.getByText(/what is acmm/i)).toBeInTheDocument()
  })

  it('calls openIntro when What is ACMM? is clicked', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByText(/what is acmm/i))
    expect(mockOpenIntro).toHaveBeenCalledOnce()
  })

  it('shows validation error for invalid repo format on submit', async () => {
    const user = userEvent.setup()
    renderPicker()
    const input = screen.getByRole('combobox', { name: /github repository/i })
    await user.clear(input)
    await user.type(input, 'not-valid!!!')
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByText(/invalid format/i)).toBeInTheDocument()
  })

  it('shows error for empty submit', async () => {
    const user = userEvent.setup()
    renderPicker()
    const input = screen.getByRole('combobox', { name: /github repository/i })
    await user.clear(input)
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByText(/enter a repo/i)).toBeInTheDocument()
  })

  it('calls setRepo and showToast on valid submit', async () => {
    const user = userEvent.setup()
    renderPicker()
    const input = screen.getByRole('combobox', { name: /github repository/i })
    await user.clear(input)
    await user.type(input, 'org/repo')
    fireEvent.submit(input.closest('form')!)
    expect(mockSetRepo).toHaveBeenCalledWith('org/repo')
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('org/repo'),
      'success',
    )
  })

  it('shows clear button when input has text', async () => {
    renderPicker()
    // The input already has "kubestellar/console" so clear (X) button should appear
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('clears input when X button is clicked', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(
      screen.getByRole('combobox', { name: /github repository/i }),
    ).toHaveValue('')
  })

  it('shows badge panel when Get badge is clicked', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: /get badge/i }))
    expect(screen.getByText(/markdown/i)).toBeInTheDocument()
    expect(screen.getByText(/html/i)).toBeInTheDocument()
  })

  it('closes badge panel when X inside badge panel is clicked', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: /get badge/i }))
    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)
    expect(screen.queryByText(/markdown/i)).not.toBeInTheDocument()
  })

})
