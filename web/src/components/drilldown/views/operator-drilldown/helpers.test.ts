import { describe, it, expect } from 'vitest'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { getPhaseStyle } from './helpers'

describe('getPhaseStyle', () => {
  it.each([
    ['succeeded', CheckCircle, 'text-green-400'],
    ['installed', CheckCircle, 'text-green-400'],
    ['SUCCEEDED', CheckCircle, 'text-green-400'],
    ['installing', RefreshCw, 'text-blue-400'],
    ['pending', RefreshCw, 'text-blue-400'],
    ['installready', RefreshCw, 'text-blue-400'],
    ['failed', XCircle, 'text-red-400'],
    ['unknown', XCircle, 'text-red-400'],
    ['upgrading', RefreshCw, 'text-yellow-400'],
    ['replacing', RefreshCw, 'text-yellow-400'],
  ])('maps phase %s to expected style', (phase, icon, text) => {
    const style = getPhaseStyle(phase)
    expect(style.icon).toBe(icon)
    expect(style.text).toBe(text)
    expect(style.bg).toBeDefined()
    expect(style.border).toBeDefined()
  })

  it('returns fallback style for unrecognized phase', () => {
    const style = getPhaseStyle('quiescent')
    expect(style.icon).toBe(AlertTriangle)
    expect(style.text).toBe('text-muted-foreground')
    expect(style.bg).toBe('bg-secondary')
    expect(style.border).toBe('border-border')
  })

  it('handles empty string as fallback', () => {
    const style = getPhaseStyle('')
    expect(style.icon).toBe(AlertTriangle)
    expect(style.text).toBe('text-muted-foreground')
  })

  it('handles null/undefined phase safely', () => {
    // @ts-expect-error verify runtime safety of undefined input
    const styleU = getPhaseStyle(undefined)
    // @ts-expect-error verify runtime safety of null input
    const styleN = getPhaseStyle(null)
    expect(styleU.text).toBe('text-muted-foreground')
    expect(styleN.text).toBe('text-muted-foreground')
  })
})
