import { describe, it, expect } from 'vitest'
import { computeSha256, verifyIntegrity, IntegrityError, MissingIntegrityError } from '../integrity'

describe('marketplace integrity verification', () => {
  it('computes correct sha256 for known input', async () => {
    // SHA-256 of empty string is well-known
    const emptyHash = await computeSha256('')
    expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('computes consistent hash for JSON content', async () => {
    const content = '{"card_type":"test","config":{}}'
    const hash1 = await computeSha256(content)
    const hash2 = await computeSha256(content)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64)
  })

  it('verifyIntegrity passes when hash matches', async () => {
    const content = '{"hello":"world"}'
    const hash = await computeSha256(content)
    await expect(verifyIntegrity(content, hash)).resolves.toBeUndefined()
  })

  it('verifyIntegrity throws IntegrityError on mismatch', async () => {
    const content = '{"hello":"world"}'
    const wrongHash = 'a'.repeat(64)
    await expect(verifyIntegrity(content, wrongHash)).rejects.toThrow(IntegrityError)
  })

  it('verifyIntegrity rejects when expectedHash is undefined', async () => {
    await expect(verifyIntegrity('anything', undefined)).rejects.toThrow(MissingIntegrityError)
  })

  it('verifyIntegrity normalizes hash to lowercase', async () => {
    const content = '{"test":true}'
    const hash = await computeSha256(content)
    const upperHash = hash.toUpperCase()
    await expect(verifyIntegrity(content, upperHash)).resolves.toBeUndefined()
  })

  it('IntegrityError contains expected and actual hashes', async () => {
    const content = '{"data":1}'
    const fakeHash = 'b'.repeat(64)
    try {
      await verifyIntegrity(content, fakeHash)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrityError)
      expect((err as IntegrityError).message).toContain(fakeHash)
    }
  })
})
