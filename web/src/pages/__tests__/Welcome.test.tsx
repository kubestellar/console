import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mockT = vi.fn((key: string) => key)
const mockShowToast = vi.fn()

describe('Welcome', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.doMock('react-i18next', () => ({
      useTranslation: () => ({ t: mockT }),
    }))

    vi.doMock('react-router-dom', () => ({
      Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
      useSearchParams: () => [new URLSearchParams()],
    }))

    const mockToastModule = () => ({
      useToast: () => ({ showToast: mockShowToast }),
    })

    vi.doMock('../../components/ui/Toast', mockToastModule)
    vi.doMock('/src/components/ui/Toast', mockToastModule)

    vi.doMock('../../components/CardWrapper', () => ({
      default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    }))

    vi.doMock('../../components/cards/ClusterHealth', () => {
      throw new Error('card registry load failed')
    })
    vi.doMock('/src/components/cards/ClusterHealth', () => {
      throw new Error('card registry load failed')
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('shows an error toast when card registry loading fails', async () => {
    const { default: Welcome } = await import('../Welcome')

    render(<Welcome />)

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('messages.loadFailed', 'error')
    })
  })
})
