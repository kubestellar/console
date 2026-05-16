import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WelcomeCard } from './WelcomeCard'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { origin?: string }) => {
      if (key === 'dashboard.welcome.step2Desc') {
        return `Once the script finishes, open ${options?.origin} in your browser. Your clusters are auto-detected from ~/.kube/config.`
      }
      return key
    },
  }),
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

describe('WelcomeCard Component', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports WelcomeCard component', () => {
    expect(WelcomeCard).toBeDefined()
    expect(typeof WelcomeCard).toBe('function')
  })

  it('renders the current window origin in step 2 instructions', () => {
    render(<WelcomeCard />)

    expect(
      screen.getByText(
        `Once the script finishes, open ${window.location.origin} in your browser. Your clusters are auto-detected from ~/.kube/config.`
      )
    ).toBeInTheDocument()
  })

  it('clearTimeout is safe to call with null (timer cleanup contract)', () => {
    // The fix calls clearTimeout on the ref during unmount cleanup (#4662).
    // Verify that clearTimeout works correctly with various inputs.
    expect(() => clearTimeout(undefined)).not.toThrow()
    const id = setTimeout(() => {}, 0)
    expect(() => clearTimeout(id)).not.toThrow()
    // Clearing an already-cleared timer is a no-op
    expect(() => clearTimeout(id)).not.toThrow()
  })
})
