/**
 * ChunkErrorBoundary Component Unit Tests
 * Basic tests for the error boundary component
 */

import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

// Suppress console.error for error boundary tests
const originalError = console.error
beforeAll(() => {
  console.error = vi.fn()
})
afterAll(() => {
  console.error = originalError
})

describe('ChunkErrorBoundary', () => {
  describe('Component Import', () => {
    it('should be defined', () => {
      expect(ChunkErrorBoundary).toBeDefined()
    })

    it('should render without crashing', () => {
      render(
        <ChunkErrorBoundary>
          <div data-testid="child">Test</div>
        </ChunkErrorBoundary>
      )
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('should render children correctly', () => {
      render(
        <ChunkErrorBoundary>
          <span data-testid="span-child">Content</span>
        </ChunkErrorBoundary>
      )
      expect(screen.getByTestId('span-child')).toBeInTheDocument()
    })

    it('should render multiple children', () => {
      render(
        <ChunkErrorBoundary>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </ChunkErrorBoundary>
      )
      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })
  })
})
