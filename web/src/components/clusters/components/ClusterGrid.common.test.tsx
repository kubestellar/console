import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children, content }: { children: React.ReactNode; content: string }) => (
    <div data-tooltip={content}>{children}</div>
  ),
}))

import { RemoveClusterButton, ActionTooltipWrapper, handleCardKeyDown } from './ClusterGrid.common'

describe('ClusterGrid.common', () => {
  describe('RemoveClusterButton', () => {
    it('renders remove button', () => {
      const onRemove = vi.fn()
      const { getByTestId } = render(<RemoveClusterButton onRemove={onRemove} />)
      expect(getByTestId('remove-cluster-button')).toBeTruthy()
    })

    it('calls onRemove when clicked', () => {
      const onRemove = vi.fn()
      const { getByTestId } = render(<RemoveClusterButton onRemove={onRemove} />)
      const button = getByTestId('remove-cluster-button')
      button.click()
      expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('prevents event propagation when clicked', () => {
      const onRemove = vi.fn()
      const onClick = vi.fn()
      const { getByTestId } = render(
        <div 
          onClick={onClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
          role="button"
          tabIndex={0}
        >
          <RemoveClusterButton onRemove={onRemove} />
        </div>
      )
      const button = getByTestId('remove-cluster-button')
      button.click()
      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(onClick).not.toHaveBeenCalled()
    })

    it('renders with correct size variants', () => {
      const { rerender, getByTestId } = render(<RemoveClusterButton onRemove={() => {}} size="sm" />)
      expect(getByTestId('remove-cluster-button')).toBeTruthy()
      
      rerender(<RemoveClusterButton onRemove={() => {}} size="xs" />)
      expect(getByTestId('remove-cluster-button')).toBeTruthy()
    })

    it('has accessible label', () => {
      const { getByLabelText } = render(<RemoveClusterButton onRemove={() => {}} />)
      expect(getByLabelText('cluster.removeCluster')).toBeTruthy()
    })
  })

  describe('ActionTooltipWrapper', () => {
    it('renders children and tooltip', () => {
      const { getByText, container } = render(
        <ActionTooltipWrapper tooltip="Test Tooltip">
          <button>Action</button>
        </ActionTooltipWrapper>
      )
      expect(getByText('Action')).toBeTruthy()
      expect(container.querySelector('[data-tooltip="Test Tooltip"]')).toBeTruthy()
    })

    it('prevents event propagation on click', () => {
      const parentClick = vi.fn()
      const { getByText } = render(
        <div 
          onClick={parentClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') parentClick() }}
          role="button"
          tabIndex={0}
        >
          <ActionTooltipWrapper tooltip="Test">
            <button>Action</button>
          </ActionTooltipWrapper>
        </div>
      )
      const wrapper = getByText('Action').closest('span')
      wrapper?.click()
      expect(parentClick).not.toHaveBeenCalled()
    })
  })

  describe('handleCardKeyDown', () => {
    it('calls callback when Enter key is pressed', () => {
      const callback = vi.fn()
      const handler = handleCardKeyDown(callback)
      const event = new KeyboardEvent('keydown', { key: 'Enter' }) as unknown as React.KeyboardEvent
      event.preventDefault = vi.fn()
      handler(event)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
    })

    it('calls callback when Space key is pressed', () => {
      const callback = vi.fn()
      const handler = handleCardKeyDown(callback)
      const event = new KeyboardEvent('keydown', { key: ' ' }) as unknown as React.KeyboardEvent
      event.preventDefault = vi.fn()
      handler(event)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
    })

    it('does not call callback for other keys', () => {
      const callback = vi.fn()
      const handler = handleCardKeyDown(callback)
      const event = new KeyboardEvent('keydown', { key: 'Escape' }) as unknown as React.KeyboardEvent
      event.preventDefault = vi.fn()
      handler(event)
      expect(callback).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })
})
