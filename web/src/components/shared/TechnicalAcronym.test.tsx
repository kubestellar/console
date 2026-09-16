import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TechnicalAcronym, wrapAbbreviations, TECHNICAL_ACRONYMS } from './TechnicalAcronym'

describe('TechnicalAcronym', () => {
  it('renders children as plain text when the term has no known definition', () => {
    render(<TechnicalAcronym term="UNKNOWN_TERM">UNKNOWN_TERM</TechnicalAcronym>)
    expect(screen.getByText('UNKNOWN_TERM')).toBeVisible()
  })

  it('falls back to rendering the term itself when no children are provided', () => {
    render(<TechnicalAcronym term="UNKNOWN_TERM" />)
    expect(screen.getByText('UNKNOWN_TERM')).toBeVisible()
  })

  it('applies the provided className to the rendered span for unknown terms', () => {
    render(<TechnicalAcronym term="UNKNOWN_TERM" className="custom-class">Foo</TechnicalAcronym>)
    expect(screen.getByText('Foo')).toHaveClass('custom-class')
  })

  it('wraps known terms with a tooltip trigger showing the abbreviation text', () => {
    render(<TechnicalAcronym term="RBAC">RBAC</TechnicalAcronym>)
    expect(screen.getByText('RBAC')).toBeVisible()
  })
})

describe('TECHNICAL_ACRONYMS', () => {
  it('defines full name and description for RBAC', () => {
    expect(TECHNICAL_ACRONYMS.RBAC).toEqual({
      full: 'Role-Based Access Control',
      desc: 'Authorization mechanism that regulates access to resources based on roles',
    })
  })
})

describe('wrapAbbreviations', () => {
  it('returns the original text unchanged when no abbreviations are present', () => {
    expect(wrapAbbreviations('nothing to see here')).toEqual(['nothing to see here'])
  })

  it('splits text around a recognized abbreviation into separate parts', () => {
    const result = wrapAbbreviations('Pod uses CPU heavily') as React.ReactNode[]
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('Pod uses ')
    expect(result[2]).toBe(' heavily')
  })

  it('matches the longest abbreviation first to avoid partial overlaps', () => {
    const result = wrapAbbreviations('CrashLoopBackOff detected') as React.ReactNode[]
    expect(result[0]).not.toBe('CrashLoopBackOff detected')
    expect(result).toHaveLength(2)
  })
})
