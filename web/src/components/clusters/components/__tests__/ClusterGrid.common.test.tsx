import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RemoveClusterButton, ActionTooltipWrapper, handleCardKeyDown } from '../ClusterGrid.common'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ClusterGrid.common utilities', () => {
  describe('RemoveClusterButton', () => {
    it('renders with default size', () => {
      const onRemove = vi.fn()
      render(<RemoveClusterButton onRemove={onRemove} />)
      
      const button = screen.getByTestId('remove-cluster-button')
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('aria-label', 'cluster.removeCluster')
    })

    it('renders with xs size', () => {
      const onRemove = vi.fn()
      render(<RemoveClusterButton onRemove={onRemove} size="xs" />)
      
      const button = screen.getByTestId('remove-cluster-button')
      expect(button).toBeInTheDocument()
    })

    it('calls onRemove when clicked', () => {
      const onRemove = vi.fn()
      render(<RemoveClusterButton onRemove={onRemove} />)
      
      const button = screen.getByTestId('remove-cluster-button')
      fireEvent.click(button)
      
      expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('stops propagation when clicked', () => {
      const onRemove = vi.fn()
      const parentClick = vi.fn()
      
      const { container } = render(
        <div onClick={parentClick}>
          <RemoveClusterButton onRemove={onRemove} />
        </div>
      )
      
      const button = screen.getByTestId('remove-cluster-button')
      fireEvent.click(button)
      
      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(parentClick).not.toHaveBeenCalled()
    })

    it('has correct accessibility attributes', () => {
      const onRemove = vi.fn()
      render(<RemoveClusterButton onRemove={onRemove} />)
      
      const button = screen.getByTestId('remove-cluster-button')
      expect(button).toHaveAttribute('title', 'cluster.removeCluster')
      expect(button).toHaveAttribute('aria-label', 'cluster.removeCluster')
    })
  })

  describe('ActionTooltipWrapper', () => {
    it('renders children with tooltip', () => {
      render(
        <ActionTooltipWrapper tooltip="Test tooltip">
          <button>Test Button</button>
        </ActionTooltipWrapper>
      )
      
      expect(screen.getByText('Test Button')).toBeInTheDocument()
    })

    it('stops click propagation', () => {
      const parentClick = vi.fn()
      
      render(
        <div onClick={parentClick}>
          <ActionTooltipWrapper tooltip="Test">
            <button>Click me</button>
          </ActionTooltipWrapper>
        </div>
      )
      
      const wrapper = screen.getByText('Click me').parentElement
      if (wrapper) {
        fireEvent.click(wrapper)
        expect(parentClick).not.toHaveBeenCalled()
      }
    })

    it('stops mouseDown propagation', () => {
      const parentMouseDown = vi.fn()
      
      render(
        <div onMouseDown={parentMouseDown}>
          <ActionTooltipWrapper tooltip="Test">
            <button>Test</button>
          </ActionTooltipWrapper>
        </div>
      )
      
      const wrapper = screen.getByText('Test').parentElement
      if (wrapper) {
        fireEvent.mouseDown(wrapper)
        expect(parentMouseDown).not.toHaveBeenCalled()
      }
    })
  })

  describe('handleCardKeyDown', () => {
    it('calls callback on Enter key', () => {
      const callback = vi.fn()
      const handler = handleCardKeyDown(callback)
      const event = new KeyboardEvent('keydown', { key: 'Enter' })
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
      
      handler(event as any)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('calls callback on Space key', () => {
      const callback = vi.fn()
      const handler = handleCardKeyDown(callback)
      const event = new KeyboardEvent('keydown', { key: ' ' })
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
      
      handler(event as any)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('does not call callback on other keys', () => {
      const callback = vi.fn()
      const handler = handleCardKeyDown(callback)
      const event = new KeyboardEvent('keydown', { key: 'a' })
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
      
      handler(event as any)
      expect(callback).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })
})
