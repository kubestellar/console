import { describe, it, expect } from 'vitest'
import {
  BYTES_PER_MIB,
  BYTES_PER_GIB,
  BYTES_PER_TIB,
  MIB_PER_GIB,
  KIB_PER_MIB,
  MILLICORES_PER_CORE,
  GB_TO_MIB,
  MB_TO_MIB,
} from '../units'

describe('unit constants', () => {
  it('BYTES_PER_MIB = 1024^2', () => {
    expect(BYTES_PER_MIB).toBe(1024 * 1024)
  })

  it('BYTES_PER_GIB = 1024^3', () => {
    expect(BYTES_PER_GIB).toBe(1024 * 1024 * 1024)
  })

  it('BYTES_PER_TIB = 1024 * GIB', () => {
    expect(BYTES_PER_TIB).toBe(1024 * BYTES_PER_GIB)
  })

  it('MIB_PER_GIB = 1024', () => {
    expect(MIB_PER_GIB).toBe(1024)
  })

  it('KIB_PER_MIB = 1024', () => {
    expect(KIB_PER_MIB).toBe(1024)
  })

  it('MILLICORES_PER_CORE = 1000', () => {
    expect(MILLICORES_PER_CORE).toBe(1000)
  })

  it('GB_TO_MIB converts decimal GB to binary MiB', () => {
    // 1 GB = 10^9 bytes, 1 MiB = 2^20 bytes, so ratio ≈ 953.674
    expect(GB_TO_MIB).toBeCloseTo(1_000_000 / (1024 * 1024), 5)
  })

  it('MB_TO_MIB converts decimal MB to binary MiB', () => {
    expect(MB_TO_MIB).toBeCloseTo(1_000_000 / (1024 * 1024), 5)
  })

  it('conversion chain: GIB = MIB_PER_GIB * MIB', () => {
    expect(BYTES_PER_GIB).toBe(MIB_PER_GIB * BYTES_PER_MIB)
  })
})
