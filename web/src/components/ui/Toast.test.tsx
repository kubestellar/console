import { describe, it, expect } from 'vitest'
import * as ToastModule from './Toast'

describe('Toast Component', () => {
  it('exports ToastProvider component', () => {
    expect(ToastModule.ToastProvider).toBeDefined()
    expect(typeof ToastModule.ToastProvider).toBe('function')
  })

  it('exports useToast hook', () => {
    expect(ToastModule.useToast).toBeDefined()
    expect(typeof ToastModule.useToast).toBe('function')
  })
})
