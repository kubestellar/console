/**
 * Tests for AIAssistBar component.
 *
 * Covers:
 * - Rendering with placeholder text
 * - Input interaction and submit
 * - Enter key submission
 * - Disabled state when empty or generating
 * - Generating state (loading spinner, button text)
 * - Suggestion chips rendering and click behavior
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AIAssistBar } from '../AIAssistBar'

describe('AIAssistBar', () => {
  it('renders with placeholder text', () => {
    render(<AIAssistBar placeholder="Describe what you want..." onGenerate={vi.fn()} />)
    expect(screen.getByPlaceholderText('Describe what you want...')).toBeTruthy()
  })

  it('renders the AI Assist button', () => {
    render(<AIAssistBar placeholder="Test" onGenerate={vi.fn()} />)
    expect(screen.getByText('AI Assist')).toBeTruthy()
  })

  it('calls onGenerate when button is clicked with text', () => {
    const onGenerate = vi.fn()
    render(<AIAssistBar placeholder="Test" onGenerate={onGenerate} />)

    const input = screen.getByPlaceholderText('Test')
    fireEvent.change(input, { target: { value: 'GPU monitoring dashboard' } })
    fireEvent.click(screen.getByText('AI Assist'))

    expect(onGenerate).toHaveBeenCalledWith('GPU monitoring dashboard')
  })

  it('calls onGenerate when Enter key is pressed', () => {
    const onGenerate = vi.fn()
    render(<AIAssistBar placeholder="Test" onGenerate={onGenerate} />)

    const input = screen.getByPlaceholderText('Test')
    fireEvent.change(input, { target: { value: 'Show me pods' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onGenerate).toHaveBeenCalledWith('Show me pods')
  })

  it('does not call onGenerate when input is empty', () => {
    const onGenerate = vi.fn()
    render(<AIAssistBar placeholder="Test" onGenerate={onGenerate} />)

    fireEvent.click(screen.getByText('AI Assist'))
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('does not call onGenerate when input is only whitespace', () => {
    const onGenerate = vi.fn()
    render(<AIAssistBar placeholder="Test" onGenerate={onGenerate} />)

    const input = screen.getByPlaceholderText('Test')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('AI Assist'))

    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('shows "Working..." when isGenerating is true', () => {
    render(<AIAssistBar placeholder="Test" onGenerate={vi.fn()} isGenerating />)
    expect(screen.getByText('Working...')).toBeTruthy()
  })

  it('disables button when isGenerating is true', () => {
    render(<AIAssistBar placeholder="Test" onGenerate={vi.fn()} isGenerating />)
    const button = screen.getByText('Working...').closest('button')
    expect(button).toBeDisabled()
  })

  it('does not submit when isGenerating even if input has text', () => {
    const onGenerate = vi.fn()
    render(<AIAssistBar placeholder="Test" onGenerate={onGenerate} isGenerating />)

    const input = screen.getByPlaceholderText('Test')
    fireEvent.change(input, { target: { value: 'some text' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('renders suggestion chips when provided', () => {
    const suggestions = ['GPU usage', 'Pod health', 'Cluster costs']
    render(
      <AIAssistBar
        placeholder="Test"
        onGenerate={vi.fn()}
        suggestions={suggestions}
      />
    )

    expect(screen.getByText('GPU usage')).toBeTruthy()
    expect(screen.getByText('Pod health')).toBeTruthy()
    expect(screen.getByText('Cluster costs')).toBeTruthy()
    expect(screen.getByText('Try:')).toBeTruthy()
  })

  it('does not render suggestion chips when not provided', () => {
    render(<AIAssistBar placeholder="Test" onGenerate={vi.fn()} />)
    expect(screen.queryByText('Try:')).toBeNull()
  })

  it('does not render suggestion chips when array is empty', () => {
    render(<AIAssistBar placeholder="Test" onGenerate={vi.fn()} suggestions={[]} />)
    expect(screen.queryByText('Try:')).toBeNull()
  })

  it('calls onGenerate when suggestion chip is clicked (no onSuggestionClick)', () => {
    const onGenerate = vi.fn()
    render(
      <AIAssistBar
        placeholder="Test"
        onGenerate={onGenerate}
        suggestions={['GPU usage']}
      />
    )

    fireEvent.click(screen.getByText('GPU usage'))
    expect(onGenerate).toHaveBeenCalledWith('GPU usage')
  })

  it('calls onSuggestionClick when suggestion chip is clicked (with onSuggestionClick)', () => {
    const onGenerate = vi.fn()
    const onSuggestionClick = vi.fn()
    render(
      <AIAssistBar
        placeholder="Test"
        onGenerate={onGenerate}
        suggestions={['Pod health']}
        onSuggestionClick={onSuggestionClick}
      />
    )

    fireEvent.click(screen.getByText('Pod health'))
    expect(onSuggestionClick).toHaveBeenCalledWith('Pod health')
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('updates input value when suggestion chip is clicked', () => {
    render(
      <AIAssistBar
        placeholder="Test"
        onGenerate={vi.fn()}
        suggestions={['Cluster health']}
      />
    )

    fireEvent.click(screen.getByText('Cluster health'))

    const input = screen.getByPlaceholderText('Test') as HTMLInputElement
    expect(input.value).toBe('Cluster health')
  })
})
