/**
 * ProfileSection Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-token',
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

vi.mock('../../../../lib/constants/network', () => ({
  UI_FEEDBACK_TIMEOUT_MS: 2000,
}))

describe('ProfileSection', () => {
  it('exports ProfileSection', async () => {
    const mod = await import('../ProfileSection')
    expect(mod.ProfileSection).toBeDefined()
  })

  it('renders with required props', async () => {
    const { ProfileSection } = await import('../ProfileSection')
    const { container } = render(
      <ProfileSection
        initialEmail="test@example.com"
        initialSlackId="U12345"
        refreshUser={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
    // Should have input fields
    const inputs = container.querySelectorAll('input')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('renders with loading state', async () => {
    const { ProfileSection } = await import('../ProfileSection')
    const { container } = render(
      <ProfileSection
        initialEmail=""
        initialSlackId=""
        refreshUser={vi.fn()}
        isLoading={true}
      />
    )
    expect(container).toBeTruthy()
  })
})
