import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateMission } from '../missions'

// Hoist mock variables so vi.mock factory can reference them
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    post: vi.fn(),
  },
}))

vi.mock('../../lib/api', () => ({
  api: mockApi,
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('validateMission', () => {
  it('returns a valid response on success', async () => {
    mockApi.post.mockResolvedValue({
      data: { valid: true },
    })

    const result = await validateMission({ name: 'my-mission' }, 'missions/my-mission.yaml')

    expect(result.valid).toBe(true)
    expect(mockApi.post).toHaveBeenCalledWith('/api/missions/validate', {
      mission: { name: 'my-mission' },
      path: 'missions/my-mission.yaml',
    })
  })

  it('returns validation errors when the server rejects the mission', async () => {
    mockApi.post.mockResolvedValue({
      data: { valid: false, errors: ['missing required field: name'] },
    })

    const result = await validateMission({}, 'missions/bad.yaml')

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['missing required field: name'])
  })

  it('propagates qualityScore and qualityPass when present', async () => {
    mockApi.post.mockResolvedValue({
      data: { valid: true, qualityScore: 0.95, qualityPass: true },
    })

    const result = await validateMission({ name: 'scored' }, 'missions/scored.yaml')

    expect(result.qualityScore).toBe(0.95)
    expect(result.qualityPass).toBe(true)
  })

  it('throws when the API call fails (does not swallow errors)', async () => {
    mockApi.post.mockRejectedValue(new Error('Network error'))

    await expect(validateMission({}, 'missions/x.yaml')).rejects.toThrow('Network error')
  })

  it('handles a server response with no extra fields', async () => {
    mockApi.post.mockResolvedValue({ data: { valid: true } })

    const result = await validateMission(null, '')

    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
    expect(result.qualityScore).toBeUndefined()
  })
})
