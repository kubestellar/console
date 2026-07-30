import { describe, it, expect, vi } from 'vitest'

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

vi.mock('../constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual }
})

const mod = await import('../kubectlProxy')
const {
  parseResourceQuantity,
  parseResourceQuantityMillicores,
} = mod.__testables

describe('parseResourceQuantity', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantity(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantity('')).toBe(0)
  })

  it('parses plain numbers', () => {
    expect(parseResourceQuantity('1024')).toBe(1024)
  })

  it('parses Ki suffix (kibibytes)', () => {
    expect(parseResourceQuantity('1Ki')).toBe(1024)
  })

  it('parses Mi suffix (mebibytes)', () => {
    expect(parseResourceQuantity('1Mi')).toBe(1024 * 1024)
  })

  it('parses Gi suffix (gibibytes)', () => {
    expect(parseResourceQuantity('1Gi')).toBe(1024 * 1024 * 1024)
  })

  it('parses Ti suffix (tebibytes)', () => {
    expect(parseResourceQuantity('1Ti')).toBe(1024 * 1024 * 1024 * 1024)
  })

  it('parses K suffix (kilobytes)', () => {
    expect(parseResourceQuantity('1K')).toBe(1000)
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
    expect(parseResourceQuantity('500m')).toBe(0.5)
  })

  it('parses decimal values', () => {
    expect(parseResourceQuantity('2.5Gi')).toBe(2.5 * 1024 * 1024 * 1024)
  })

  it('returns 0 for unparseable string', () => {
    expect(parseResourceQuantity('abc')).toBe(0)
  })

  it('parses "0" as zero', () => {
    expect(parseResourceQuantity('0')).toBe(0)
  })
})

describe('parseResourceQuantityMillicores', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantityMillicores(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantityMillicores('')).toBe(0)
  })

  it('parses millicores suffix', () => {
    expect(parseResourceQuantityMillicores('100m')).toBe(100)
  })

  it('parses 500m as 500 millicores', () => {
    expect(parseResourceQuantityMillicores('500m')).toBe(500)
  })

  it('parses whole cores to millicores', () => {
    expect(parseResourceQuantityMillicores('1')).toBe(1000)
  })

  it('parses fractional cores to millicores', () => {
    expect(parseResourceQuantityMillicores('0.5')).toBe(500)
  })

  it('parses 2.5 cores to 2500 millicores', () => {
    expect(parseResourceQuantityMillicores('2.5')).toBe(2500)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseResourceQuantityMillicores('abc')).toBe(0)
  })

  it('returns 0 for "abcm" (non-numeric millicores)', () => {
    expect(parseResourceQuantityMillicores('abcm')).toBe(0)
  })

  it('trims whitespace', () => {
    expect(parseResourceQuantityMillicores('  200m  ')).toBe(200)
  })
})
