import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createPortal } from 'react-dom'

// createPortal renders outside the component tree — render inline for tests
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  }
})

const mockShowToast = vi.hoisted(() => vi.fn())
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const mockSubmitResponse = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockDismiss = vi.hoisted(() => vi.fn())
const mockIsVisible = vi.hoisted(() => ({ value: true }))

vi.mock('../../../hooks/useNPSSurvey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useNPSSurvey')>()
  return {
    ...actual,
    useNPSSurvey: () => ({
      isVisible: mockIsVisible.value,
      submitResponse: mockSubmitResponse,
      dismiss: mockDismiss,
    }),
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    matchPath: actual.matchPath,
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, _opts?: unknown) => {
      const map: Record<string, string> = {
        'nps.title': 'How would you rate your experience?',
        'nps.notGreat': 'Not great',
        'nps.meh': 'Meh',
        'nps.good': 'Good',
        'nps.loveIt': 'Love it',
        'nps.dismiss': 'Dismiss',
        'nps.submit': 'Submit',
        'nps.thankYou': 'Thank you!',
        'nps.thankYouDetail': 'Your feedback helps us improve.',
        'nps.submitError': 'Failed to submit. Please try again.',
        'nps.feedbackNegative': 'What went wrong?',
        'nps.feedbackNeutral': 'What could be better?',
        'nps.feedbackPositive': 'What do you love?',
        'nps.feedbackPlaceholder': 'Your feedback...',
        'nps.publicIssueConsent': 'Create a public GitHub issue',
        'nps.publicIssueDisclosure': 'Your feedback may be posted publicly.',
      }
      return map[key] ?? key
    },
  }),
}))

import { NPSSurvey } from '../NPSSurvey'

function renderSurvey() {
  return render(<NPSSurvey />)
}

describe('NPSSurvey — visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsVisible.value = true
  })

  it('renders survey widget when isVisible is true', () => {
    renderSurvey()
    expect(screen.getByText('How would you rate your experience?')).toBeInTheDocument()
  })

  it('renders all 4 emoji score buttons', () => {
    renderSurvey()
    expect(screen.getByRole('button', { name: /not great/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /meh/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /good/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /love it/i })).toBeInTheDocument()
  })

  it('renders Dismiss button', () => {
    renderSurvey()
    const dismissBtns = screen.getAllByText('Dismiss')
    expect(dismissBtns.length).toBeGreaterThan(0)
  })

  it('renders Submit button', () => {
    renderSurvey()
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
  })

  it('Submit button is disabled when no score selected', () => {
    renderSurvey()
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })
})

describe('NPSSurvey — score selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsVisible.value = true
  })

  it('shows feedback textarea after selecting a score', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    expect(screen.getByPlaceholderText('Your feedback...')).toBeInTheDocument()
  })

  it('enables Submit button after selecting a score', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled()
  })

  it('shows positive feedback prompt for "Love it" (promoter)', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /love it/i }))
    expect(screen.getByText('What do you love?')).toBeInTheDocument()
  })

  it('shows negative feedback prompt for "Not great" (detractor)', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /not great/i }))
    expect(screen.getByText('What went wrong?')).toBeInTheDocument()
  })

  it('shows public issue checkbox for detractor score', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /not great/i }))
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('public issue checkbox is disabled when feedback is too short', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /not great/i }))
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('enables public issue checkbox when feedback is long enough', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /not great/i }))
    const textarea = screen.getByPlaceholderText('Your feedback...')
    await user.type(textarea, 'This is a detailed enough feedback comment for the issue')
    expect(screen.getByRole('checkbox')).not.toBeDisabled()
  })

  it('does not show public issue checkbox for non-detractor score', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('NPSSurvey — submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsVisible.value = true
    mockSubmitResponse.mockResolvedValue(undefined)
  })

  it('calls submitResponse with score and feedback on submit', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    const textarea = screen.getByPlaceholderText('Your feedback...')
    await user.type(textarea, 'Great product')
    await user.click(screen.getByRole('button', { name: /submit/i }))
    expect(mockSubmitResponse).toHaveBeenCalledWith(3, 'Great product', { allowPublicIssue: false })
  })

  it('calls submitResponse with score only when no feedback entered', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    await user.click(screen.getByRole('button', { name: /submit/i }))
    expect(mockSubmitResponse).toHaveBeenCalledWith(3, undefined, { allowPublicIssue: false })
  })

  it('shows thank-you message after successful submit', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    await user.click(screen.getByRole('button', { name: /submit/i }))
    expect(screen.getByText('Thank you!')).toBeInTheDocument()
  })

  it('calls showToast with success after submit', async () => {
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    await user.click(screen.getByRole('button', { name: /submit/i }))
    expect(mockShowToast).toHaveBeenCalledWith('Thank you!', 'success')
  })

  it('calls showToast with error when submission fails', async () => {
    mockSubmitResponse.mockRejectedValueOnce(new Error('network error'))
    const user = userEvent.setup()
    renderSurvey()
    await user.click(screen.getByRole('button', { name: /good/i }))
    await user.click(screen.getByRole('button', { name: /submit/i }))
    expect(mockShowToast).toHaveBeenCalledWith('Failed to submit. Please try again.', 'error')
  })
})

describe('NPSSurvey — dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsVisible.value = true
  })

  it('calls dismiss when X button is clicked', async () => {
    const user = userEvent.setup()
    renderSurvey()
    const dismissBtns = screen.getAllByRole('button', { name: /dismiss/i })
    await user.click(dismissBtns[0])
    expect(mockDismiss).toHaveBeenCalledOnce()
  })

  it('calls dismiss when bottom Dismiss text is clicked', async () => {
    const user = userEvent.setup()
    renderSurvey()
    const dismissBtns = screen.getAllByText('Dismiss')
    await user.click(dismissBtns[dismissBtns.length - 1])
    expect(mockDismiss).toHaveBeenCalled()
  })
})
