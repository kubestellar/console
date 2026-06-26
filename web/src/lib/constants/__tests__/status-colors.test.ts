import { describe, it, expect } from 'vitest'

describe('constants/status-colors', () => {
  it('module can be imported', async () => {
    const mod = await import('../status-colors')
    expect(mod).toBeDefined()
  })

  it('exports expected status color constants and helpers', async () => {
    const {
      STATUS_TEXT_COLORS,
      STATUS_BG_COLORS,
      STATUS_CLASSES,
      getStatusClasses,
    } = await import('../status-colors')

    expect(STATUS_TEXT_COLORS.success).toBe('text-green-400')
    expect(STATUS_BG_COLORS.error).toBe('bg-red-500/10')
    expect(STATUS_CLASSES.warning.combined).toContain('text-yellow-400')
    expect(getStatusClasses('success')).toEqual(STATUS_CLASSES.success)
    expect(getStatusClasses('unknown-status')).toEqual(STATUS_CLASSES.info)
  })
})
