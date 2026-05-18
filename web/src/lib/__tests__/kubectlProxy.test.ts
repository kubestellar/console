/**
 * Tests for kubectlProxy.__testables — parseResourceQuantity, parseResourceQuantityMillicores
 */
import { describe, it, expect } from 'vitest'
import { __testables } from '../kubectlProxy'

const { parseResourceQuantity, parseResourceQuantityMillicores } = __testables

describe('parseResourceQuantity', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantity(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantity('')).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseResourceQuantity('abc')).toBe(0)
  })

  it('parses plain integer', () => {
    expect(parseResourceQuantity('8')).toBe(8)
  })

  it('parses plain float', () => {
    expect(parseResourceQuantity('1.5')).toBe(1.5)
  })

  it('parses Ki suffix (kibibytes)', () => {
    expect(parseResourceQuantity('1Ki')).toBe(1024)
    expect(parseResourceQuantity('8Ki')).toBe(8 * 1024)
  })

  it('parses Mi suffix (mebibytes)', () => {
    expect(parseResourceQuantity('1Mi')).toBe(1024 * 1024)
    expect(parseResourceQuantity('512Mi')).toBe(512 * 1024 * 1024)
  })

  it('parses Gi suffix (gibibytes)', () => {
    expect(parseResourceQuantity('1Gi')).toBe(1024 ** 3)
    expect(parseResourceQuantity('4Gi')).toBe(4 * 1024 ** 3)
  })

  it('parses Ti suffix (tebibytes)', () => {
    expect(parseResourceQuantity('1Ti')).toBe(1024 ** 4)
  })

  it('parses K suffix (kilobytes)', () => {
    expect(parseResourceQuantity('1K')).toBe(1000)
    expect(parseResourceQuantity('10K')).toBe(10_000)
  })

  it('parses M suffix (megabytes)', () => {
    expect(parseResourceQuantity('1M')).toBe(1_000_000)
  })

  it('parses G suffix (gigabytes)', () => {
    expect(parseResourceQuantity('1G')).toBe(1_000_000_000)
  })

  it('parses T suffix (terabytes)', () => {
    expect(parseResourceQuantity('1T')).toBe(1_000_000_000_000)
  })

  it('parses m suffix (millicores)', () => {
    expect(parseResourceQuantity('500m')).toBeCloseTo(0.5)
    expect(parseResourceQuantity('100m')).toBeCloseTo(0.1)
  })

  it('handles decimal with Ki', () => {
    expect(parseResourceQuantity('1.5Ki')).toBe(1.5 * 1024)
  })
})

describe('parseResourceQuantityMillicores', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantityMillicores(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantityMillicores('')).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseResourceQuantityMillicores('abc')).toBe(0)
  })

  it('parses millicores suffix m', () => {
    expect(parseResourceQuantityMillicores('100m')).toBe(100)
    expect(parseResourceQuantityMillicores('500m')).toBe(500)
    expect(parseResourceQuantityMillicores('1000m')).toBe(1000)
  })

  it('converts whole cores to millicores', () => {
    expect(parseResourceQuantityMillicores('1')).toBe(1000)
    expect(parseResourceQuantityMillicores('2')).toBe(2000)
    expect(parseResourceQuantityMillicores('0.5')).toBe(500)
  })

  it('converts fractional cores to millicores', () => {
    expect(parseResourceQuantityMillicores('0.1')).toBeCloseTo(100)
    expect(parseResourceQuantityMillicores('2.5')).toBeCloseTo(2500)
  })

  it('trims whitespace before parsing', () => {
    expect(parseResourceQuantityMillicores(' 500m')).toBe(500)
    expect(parseResourceQuantityMillicores(' 1 ')).toBe(1000)
  })
})
