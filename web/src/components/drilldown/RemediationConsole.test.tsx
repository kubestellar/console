import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { RemediationConsole } from './RemediationConsole'

vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ addTokens: vi.fn() }),
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../lib/download', () => ({
  downloadText: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const BASE_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  resourceType: 'pod' as const,
  resourceName: 'my-pod',
  namespace: 'default',
  cluster: 'prod-cluster',
  issues: ['CrashLoopBackOff'],
}

describe('RemediationConsole Component', () => {
  it('exports RemediationConsole component', () => {
    expect(RemediationConsole).toBeDefined()
    expect(typeof RemediationConsole).toBe('function')
  })

  it('renders the modal when isOpen is true', () => {
    render(<RemediationConsole {...BASE_PROPS} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(<RemediationConsole {...BASE_PROPS} isOpen={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<RemediationConsole {...BASE_PROPS} onClose={onClose} />)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
