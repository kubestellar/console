import { describe, it, expect, beforeEach } from 'vitest'

const mod = await import('../networking')
const { loadServicesCacheFromStorage } = mod.__networkingTestables

beforeEach(() => {
  localStorage.clear()
})

describe('networking services failures', () => {
  it('returns null for malformed cache payload', () => {
    localStorage.setItem('kubestellar-services-cache', '{bad-json')
    expect(loadServicesCacheFromStorage('services:all')).toBeNull()
  })
})
