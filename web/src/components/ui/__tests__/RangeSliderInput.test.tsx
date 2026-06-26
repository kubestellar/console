import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RangeSliderInput } from '../RangeSliderInput'

describe('RangeSliderInput', () => {
  it('renders without crashing', () => {
    const { container } = render(<RangeSliderInput value={50} onChange={() => {}} />)
    expect(container).toBeTruthy()
  })

  it('renders a range input with the given value', () => {
    const { container } = render(<RangeSliderInput value={40} onChange={() => {}} />)
    const input = container.querySelector('input[type="range"]')
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('40')
  })

  it('applies fill width at 50% for midpoint value', () => {
    const { container } = render(<RangeSliderInput value={50} min={0} max={100} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('50%')
  })

  it('sets fill width to 0% when value equals min', () => {
    const { container } = render(<RangeSliderInput value={0} min={0} max={100} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('0%')
  })

  it('sets fill width to 100% when value equals max', () => {
    const { container } = render(<RangeSliderInput value={100} min={0} max={100} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('100%')
  })

  it('clamps fill to 0% when value is below min', () => {
    const { container } = render(<RangeSliderInput value={-10} min={0} max={100} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('0%')
  })

  it('clamps fill to 100% when value exceeds max', () => {
    const { container } = render(<RangeSliderInput value={200} min={0} max={100} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('100%')
  })

  it('renders fill at 0% when min equals max (zero-range guard)', () => {
    const { container } = render(<RangeSliderInput value={50} min={50} max={50} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('0%')
  })

  it('uses string value by parsing it numerically', () => {
    const { container } = render(<RangeSliderInput value="75" min={0} max={100} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('75%')
  })

  it('falls back to min fill when value is a non-numeric string', () => {
    const { container } = render(<RangeSliderInput value="abc" min={0} max={100} onChange={() => {}} />)
    const fill = container.querySelector('[data-slider-fill="true"]') as HTMLElement
    expect(fill?.style.width).toBe('0%')
  })

  it('applies disabled attribute to the input when disabled is true', () => {
    const { container } = render(<RangeSliderInput value={50} onChange={() => {}} disabled />)
    const input = container.querySelector('input[type="range"]')
    expect(input).toBeDisabled()
  })

  it('forwards custom className to the input element', () => {
    const { container } = render(<RangeSliderInput value={50} onChange={() => {}} className="custom-class" />)
    const input = container.querySelector('input[type="range"]')
    expect(input?.className).toContain('custom-class')
  })

  it('applies containerClassName to the outer wrapper', () => {
    const { container } = render(
      <RangeSliderInput value={50} onChange={() => {}} containerClassName="outer-wrapper" />,
    )
    expect(container.firstChild).toHaveClass('outer-wrapper')
  })

  it('applies trackClassName to the track background', () => {
    const { container } = render(
      <RangeSliderInput value={50} onChange={() => {}} trackClassName="custom-track" />,
    )
    const track = container.querySelector('.custom-track')
    expect(track).toBeInTheDocument()
  })

  it('applies fillClassName to the fill element', () => {
    const { container } = render(
      <RangeSliderInput value={50} onChange={() => {}} fillClassName="custom-fill" />,
    )
    const fill = container.querySelector('[data-slider-fill="true"]')
    expect(fill?.className).toContain('custom-fill')
  })

  it('forwards min, max, step to the underlying input', () => {
    const { container } = render(
      <RangeSliderInput value={5} min={1} max={10} step={2} onChange={() => {}} />,
    )
    const input = container.querySelector('input[type="range"]')
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '10')
    expect(input).toHaveAttribute('step', '2')
  })
})
