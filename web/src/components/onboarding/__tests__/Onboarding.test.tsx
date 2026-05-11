import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const {
  mockNavigate,
  mockRefreshUser,
  mockSafeGetItem,
  mockSafeSetItem,
  mockSafeSetJSON,
  mockSafeRemoveItem,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRefreshUser: vi.fn(),
  mockSafeGetItem: vi.fn(),
  mockSafeSetItem: vi.fn(),
  mockSafeSetJSON: vi.fn(),
  mockSafeRemoveItem: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../lib/api', () => ({
  api: { post: vi.fn() },
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}))

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: mockSafeGetItem,
  safeSetItem: mockSafeSetItem,
  safeSetJSON: mockSafeSetJSON,
  safeRemoveItem: mockSafeRemoveItem,
}))

import { DEMO_TOKEN_VALUE, STORAGE_KEY_ONBOARDED, STORAGE_KEY_ONBOARDING_RESPONSES } from '../../../lib/constants'
import { Onboarding } from '../Onboarding'

const CONTINUE_LABEL = 'onboarding.continue'
const COMPLETE_SETUP_LABEL = 'onboarding.complete'
const FALLBACK_ERROR_MESSAGE = 'Failed to complete onboarding. Please try again.'
const REFRESH_FAILURE_MESSAGE = 'Demo onboarding failed'

function completeOnboardingFlow() {
  fireEvent.click(screen.getByText('SRE'))
  fireEvent.click(screen.getByRole('button', { name: CONTINUE_LABEL }))

  fireEvent.click(screen.getByText('Infrastructure (nodes, storage)'))
  fireEvent.click(screen.getByRole('button', { name: CONTINUE_LABEL }))

  fireEvent.click(screen.getByText('1-3'))
  fireEvent.click(screen.getByRole('button', { name: CONTINUE_LABEL }))

  fireEvent.click(screen.getByRole('button', { name: CONTINUE_LABEL }))

  fireEvent.click(screen.getByText('Yes, heavily'))
  fireEvent.click(screen.getByRole('button', { name: CONTINUE_LABEL }))

  fireEvent.click(screen.getByRole('button', { name: CONTINUE_LABEL }))

  fireEvent.click(screen.getByText('Yes'))
}

describe('Onboarding', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockRefreshUser.mockReset()
    mockSafeGetItem.mockReset()
    mockSafeSetItem.mockReset()
    mockSafeSetJSON.mockReset()
    mockSafeRemoveItem.mockReset()

    mockSafeGetItem.mockReturnValue(DEMO_TOKEN_VALUE)
    mockSafeSetItem.mockReturnValue(true)
    mockSafeSetJSON.mockReturnValue(true)
    mockRefreshUser.mockResolvedValue(undefined)
  })

  it('exports Onboarding component', () => {
    expect(Onboarding).toBeDefined()
  })

  it('surfaces demo-mode refresh errors instead of navigating home', async () => {
    mockRefreshUser.mockRejectedValueOnce(new Error(REFRESH_FAILURE_MESSAGE))

    render(<Onboarding />)
    completeOnboardingFlow()
    fireEvent.click(screen.getByRole('button', { name: COMPLETE_SETUP_LABEL }))

    await waitFor(() => {
      expect(screen.getByText(REFRESH_FAILURE_MESSAGE)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockSafeRemoveItem).toHaveBeenCalledWith(STORAGE_KEY_ONBOARDING_RESPONSES)
    expect(mockSafeRemoveItem).toHaveBeenCalledWith(STORAGE_KEY_ONBOARDED)
  })

  it('surfaces demo-mode storage failures instead of silently completing onboarding', async () => {
    mockSafeSetJSON.mockReturnValueOnce(false)

    render(<Onboarding />)
    completeOnboardingFlow()
    fireEvent.click(screen.getByRole('button', { name: COMPLETE_SETUP_LABEL }))

    await waitFor(() => {
      expect(screen.getByText(FALLBACK_ERROR_MESSAGE)).toBeInTheDocument()
    })
    expect(mockRefreshUser).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
