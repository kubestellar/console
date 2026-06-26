import { describe, it, expect } from 'vitest'
import { ToastProvider, useToast } from './Toast'

describe('Toast Component', () => {
  it('exports ToastProvider component', () => {
    expect(ToastProvider).toBeDefined()
    expect(typeof ToastProvider).toBe('function')
  })

  it('exports useToast hook', () => {
    expect(useToast).toBeDefined()
    expect(typeof useToast).toBe('function')
  })
})
