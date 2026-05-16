import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Slider } from '../Slider'

describe('Slider', () => {
  it('renders without crashing', () => {
    const { container } = render(<Slider value={5000} onChange={() => {}} />)
    expect(container).toBeTruthy()
  })

  it('renders the underlying range input', () => {
    const { container } = render(<Slider value={5000} onChange={() => {}} />)
    expect(container.querySelector('input[type="range"]')).toBeInTheDocument()
  })

  it('does not render a label element when label prop is omitted', () => {
    render(<Slider value={5000} onChange={() => {}} />)
    // There should be no <label> element in the DOM
    expect(document.querySelector('label')).not.toBeInTheDocument()
  })

  it('renders the label text when label prop is provided', () => {
    render(<Slider label="Timeout" value={5000} onChange={() => {}} />)
    expect(screen.getByText('Timeout')).toBeInTheDocument()
  })

  it('displays value with unit suffix by default', () => {
    render(<Slider label="Speed" value={3000} unit="ms" onChange={() => {}} />)
    expect(screen.getByText('3000ms')).toBeInTheDocument()
  })

  it('displays an empty unit when unit is not provided', () => {
    render(<Slider label="Level" value={7000} onChange={() => {}} />)
    expect(screen.getByText('7000')).toBeInTheDocument()
  })

  it('uses formatValue to display a custom label instead of raw value+unit', () => {
    const formatValue = vi.fn((v: number) => `${v / 1000}s`)
    render(<Slider label="Interval" value={5000} formatValue={formatValue} unit="ms" onChange={() => {}} />)
    expect(formatValue).toHaveBeenCalledWith(5000)
    expect(screen.getByText('5s')).toBeInTheDocument()
  })

  it('ignores formatValue when value is not a number', () => {
    const formatValue = vi.fn((v: number) => `${v}x`)
    render(<Slider label="Count" value="not-a-number" formatValue={formatValue} onChange={() => {}} />)
    expect(formatValue).not.toHaveBeenCalled()
    expect(screen.getByText('not-a-number')).toBeInTheDocument()
  })

  it('passes min, max, step down to the range input', () => {
    const { container } = render(
      <Slider value={2000} min={500} max={10000} step={500} onChange={() => {}} />,
    )
    const input = container.querySelector('input[type="range"]')
    expect(input).toHaveAttribute('min', '500')
    expect(input).toHaveAttribute('max', '10000')
    expect(input).toHaveAttribute('step', '500')
  })

  it('disables the range input when disabled prop is true', () => {
    const { container } = render(<Slider value={5000} onChange={() => {}} disabled />)
    expect(container.querySelector('input[type="range"]')).toBeDisabled()
  })

  it('links the label element to the range input via matching id', () => {
    render(<Slider label="Retry delay" value={2000} onChange={() => {}} />)
    const labelEl = screen.getByText('Retry delay').closest('label')
    const input = screen.getByRole('slider')
    expect(labelEl).toHaveAttribute('for', input.id)
  })
})
