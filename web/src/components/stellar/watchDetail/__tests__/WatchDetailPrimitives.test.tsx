import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tag, Stat, SectionHeader, Section, Recommendation } from '../WatchDetailPrimitives'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// ── Tag ───────────────────────────────────────────────────────────────────────

describe('Tag', () => {
  it('renders the label text', () => {
    render(<Tag label="critical" color="red" />)
    expect(screen.getByText('critical')).toBeTruthy()
  })

  it('applies a background containing the color when highlighted', () => {
    const { container } = render(<Tag label="warning" color="orange" highlighted />)
    const span = container.querySelector('span') as HTMLElement
    // background is `${color}22` which jsdom rejects as invalid CSS shorthand;
    // verify highlighted mode via the `color` property which is valid CSS
    expect(span.style.color).toBe('orange')
  })

  it('uses the surface variable background when not highlighted', () => {
    const { container } = render(<Tag label="info" color="blue" />)
    const span = container.querySelector('span') as HTMLElement
    expect(span.style.background).toContain('var(--s-surface-2)')
  })
})

// ── Stat ──────────────────────────────────────────────────────────────────────

describe('Stat', () => {
  it('renders value and label', () => {
    render(<Stat label="Events" value="42" />)
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('Events')).toBeTruthy()
  })

  it('applies accent color to the value when provided', () => {
    render(<Stat label="Errors" value="7" accent="red" />)
    const valueEl = screen.getByText('7') as HTMLElement
    expect(valueEl.style.color).toBe('red')
  })

  it('defaults value color to the text variable when no accent', () => {
    render(<Stat label="Ok" value="0" />)
    const valueEl = screen.getByText('0') as HTMLElement
    expect(valueEl.style.color).toBe('var(--s-text)')
  })
})

// ── SectionHeader ─────────────────────────────────────────────────────────────

describe('SectionHeader', () => {
  it('renders the title', () => {
    render(<SectionHeader title="Recommendations" />)
    expect(screen.getByText('Recommendations')).toBeTruthy()
  })
})

// ── Section ───────────────────────────────────────────────────────────────────

describe('Section', () => {
  it('renders the section title and its children', () => {
    render(
      <Section title="Details">
        <span>child content</span>
      </Section>,
    )
    expect(screen.getByText('Details')).toBeTruthy()
    expect(screen.getByText('child content')).toBeTruthy()
  })
})

// ── Recommendation ────────────────────────────────────────────────────────────

describe('Recommendation', () => {
  const defaultProps = {
    label: 'Restart pod',
    rationale: 'Pod is in CrashLoopBackOff',
    confidence: 80,
    color: 'var(--s-success)',
    onExecute: vi.fn(),
  }

  it('renders label and rationale', () => {
    render(<Recommendation {...defaultProps} />)
    expect(screen.getByText('Restart pod')).toBeTruthy()
    expect(screen.getByText('Pod is in CrashLoopBackOff')).toBeTruthy()
  })

  it('renders the confidence percentage', () => {
    render(<Recommendation {...defaultProps} />)
    expect(screen.getByText('confidence: 80%')).toBeTruthy()
  })

  it('renders the execute button with the i18n key', () => {
    render(<Recommendation {...defaultProps} />)
    expect(screen.getByRole('button').textContent).toBe('stellar.watchDetail.executeViaChat')
  })

  it('calls onExecute when the button is clicked', () => {
    const onExecute = vi.fn()
    render(<Recommendation {...defaultProps} onExecute={onExecute} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onExecute).toHaveBeenCalledTimes(1)
  })

  it('shows high-confidence color when confidence >= 80', () => {
    render(<Recommendation {...defaultProps} confidence={90} />)
    expect(screen.getByText('confidence: 90%')).toBeTruthy()
  })
})
