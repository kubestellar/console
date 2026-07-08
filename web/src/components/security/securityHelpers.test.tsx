import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { severityColor, typeIcon, getTypeLabel } from './securityHelpers'

describe('severityColor', () => {
  it('returns red classes for high severity', () => {
    expect(severityColor('high')).toBe('text-red-400 bg-red-500/20')
  })

  it('returns yellow classes for medium severity', () => {
    expect(severityColor('medium')).toBe('text-yellow-400 bg-yellow-500/20')
  })

  it('returns blue classes for low severity', () => {
    expect(severityColor('low')).toBe('text-blue-400 bg-blue-500/20')
  })

  it('returns muted classes for fallback severities', () => {
    expect(severityColor('')).toBe('text-muted-foreground bg-card')
    expect(severityColor('unknown')).toBe('text-muted-foreground bg-card')
    expect(severityColor('critical')).toBe('text-muted-foreground bg-card')
  })

  it('returns muted classes for null-like values', () => {
    expect(severityColor('undefined')).toBe('text-muted-foreground bg-card')
    expect(severityColor('null')).toBe('text-muted-foreground bg-card')
  })

  it('is case-sensitive', () => {
    expect(severityColor('HIGH')).toBe('text-muted-foreground bg-card')
    expect(severityColor('Medium')).toBe('text-muted-foreground bg-card')
  })
})

describe('typeIcon', () => {
  it('renders an SVG for privileged type (red)', () => {
    const { container } = render(<>{typeIcon('privileged')}</>)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.classList.toString()).toContain('text-red-400')
    expect(svg?.classList.toString()).toContain('w-5')
    expect(svg?.classList.toString()).toContain('h-5')
  })

  it('renders an SVG for root type (yellow)', () => {
    const { container } = render(<>{typeIcon('root')}</>)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.classList.toString()).toContain('text-yellow-400')
  })

  it('renders a default SVG for unknown type (blue)', () => {
    const { container } = render(<>{typeIcon('unknown-type')}</>)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.classList.toString()).toContain('text-blue-400')
  })

  it('renders a default SVG for empty string', () => {
    const { container } = render(<>{typeIcon('')}</>)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.classList.toString()).toContain('text-blue-400')
  })

  it('all icons have consistent sizing', () => {
    const types = ['privileged', 'root', 'unknown']
    types.forEach(type => {
      const { container } = render(<>{typeIcon(type)}</>)
      const svg = container.querySelector('svg')
      expect(svg?.classList.toString()).toContain('w-5')
      expect(svg?.classList.toString()).toContain('h-5')
    })
  })
})

describe('getTypeLabel', () => {
  const t = (key: string) => key  // identity mock

  it('maps privileged → security.privilegedContainers', () => {
    expect(getTypeLabel('privileged', t)).toBe('security.privilegedContainers')
  })

  it('maps root → security.runAsRoot', () => {
    expect(getTypeLabel('root', t)).toBe('security.runAsRoot')
  })

  it('maps hostNetwork → security.hostNetwork', () => {
    expect(getTypeLabel('hostNetwork', t)).toBe('security.hostNetwork')
  })

  it('maps hostPID → security.hostPID', () => {
    expect(getTypeLabel('hostPID', t)).toBe('security.hostPID')
  })

  it('maps noSecurityContext → security.noSecurityContext', () => {
    expect(getTypeLabel('noSecurityContext', t)).toBe('security.noSecurityContext')
  })

  it('falls back to raw type for unknown keys', () => {
    expect(getTypeLabel('someUnknownType', t)).toBe('someUnknownType')
  })

  it('falls back to empty string when type is empty', () => {
    expect(getTypeLabel('', t)).toBe('')
  })

  it('is case-sensitive for type keys', () => {
    expect(getTypeLabel('Privileged', t)).toBe('Privileged')
    expect(getTypeLabel('ROOT', t)).toBe('ROOT')
  })

  it('properly calls translation function for known types', () => {
    const mockT = (key: string) => `translated_${key}`
    expect(getTypeLabel('privileged', mockT)).toBe('translated_security.privilegedContainers')
    expect(getTypeLabel('root', mockT)).toBe('translated_security.runAsRoot')
  })

  it('returns raw type string for unknown types', () => {
    const mockT = (key: string) => `translated_${key}`
    expect(getTypeLabel('unknownType', mockT)).toBe('unknownType')
  })

  it('handles all known security types', () => {
    const knownTypes = ['privileged', 'root', 'hostNetwork', 'hostPID', 'noSecurityContext']
    knownTypes.forEach(type => {
      const result = getTypeLabel(type, t)
      expect(result).toContain('security.')
    })
  })
})
