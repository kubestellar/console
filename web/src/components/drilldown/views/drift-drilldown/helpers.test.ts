import { describe, it, expect } from 'vitest'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { getDriftSeverityStyle, getChangeTypeStyle } from './helpers'

describe('getDriftSeverityStyle', () => {
  it.each([
    ['none', CheckCircle, 'text-green-400'],
    ['synced', CheckCircle, 'text-green-400'],
    ['SYNCED', CheckCircle, 'text-green-400'],
    ['low', AlertTriangle, 'text-yellow-400'],
    ['minor', AlertTriangle, 'text-yellow-400'],
    ['medium', AlertTriangle, 'text-orange-400'],
    ['moderate', AlertTriangle, 'text-orange-400'],
    ['high', XCircle, 'text-red-400'],
    ['critical', XCircle, 'text-red-400'],
    ['drifted', XCircle, 'text-red-400'],
  ])('maps severity %s to expected style', (severity, icon, text) => {
    const style = getDriftSeverityStyle(severity)
    expect(style.icon).toBe(icon)
    expect(style.text).toBe(text)
    expect(style.bg).toBeDefined()
    expect(style.border).toBeDefined()
  })

  it('returns fallback style for unknown severity', () => {
    const style = getDriftSeverityStyle('unknown-value')
    expect(style.icon).toBe(AlertTriangle)
    expect(style.text).toBe('text-muted-foreground')
    expect(style.bg).toBe('bg-secondary')
    expect(style.border).toBe('border-border')
  })

  it('handles empty string as fallback', () => {
    const style = getDriftSeverityStyle('')
    expect(style.icon).toBe(AlertTriangle)
    expect(style.text).toBe('text-muted-foreground')
  })

  it('handles null/undefined severity safely', () => {
    // @ts-expect-error verify runtime safety of undefined input
    const styleU = getDriftSeverityStyle(undefined)
    // @ts-expect-error verify runtime safety of null input
    const styleN = getDriftSeverityStyle(null)
    expect(styleU.text).toBe('text-muted-foreground')
    expect(styleN.text).toBe('text-muted-foreground')
  })
})

describe('getChangeTypeStyle', () => {
  it.each([
    ['added', 'text-green-400', 'Added'],
    ['create', 'text-green-400', 'Added'],
    ['modified', 'text-yellow-400', 'Modified'],
    ['update', 'text-yellow-400', 'Modified'],
    ['changed', 'text-yellow-400', 'Modified'],
    ['deleted', 'text-red-400', 'Deleted'],
    ['remove', 'text-red-400', 'Deleted'],
    ['DELETED', 'text-red-400', 'Deleted'],
  ])('maps change type %s to expected style', (changeType, text, label) => {
    const style = getChangeTypeStyle(changeType)
    expect(style.text).toBe(text)
    expect(style.label).toBe(label)
    expect(style.bg).toBeDefined()
  })

  it('falls back and preserves original label for unknown change type', () => {
    const style = getChangeTypeStyle('mystery')
    expect(style.text).toBe('text-muted-foreground')
    expect(style.bg).toBe('bg-secondary')
    expect(style.label).toBe('mystery')
  })

  it('handles empty string as fallback with empty label', () => {
    const style = getChangeTypeStyle('')
    expect(style.text).toBe('text-muted-foreground')
    expect(style.label).toBe('')
  })
})
