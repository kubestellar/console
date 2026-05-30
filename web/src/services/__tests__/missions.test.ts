import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    post: vi.fn(),
  },
}))

vi.mock('../../lib/api', () => ({
  api: mockApi,
}))

import { api } from '../../lib/api'
import { validateMission } from '../missions'

describe('validateMission', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calls api.post with correct endpoint and payload', async () => {
    const mission = { name: 'test-mission', spec: { steps: [] } }
    vi.mocked(api.post).mockResolvedValueOnce({ data: { valid: true } })

    await validateMission(mission, '/path/to/mission.yaml')

    expect(api.post).toHaveBeenCalledWith('/api/missions/validate', {
      mission,
      path: '/path/to/mission.yaml',
    })
  })

  it('returns response data for a valid mission', async () => {
    const mockData = { valid: true, qualityPass: true, qualityScore: 95 }
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockData })

    await expect(validateMission({}, 'valid.yaml')).resolves.toEqual(mockData)
  })

  it('returns response data for an invalid mission with errors', async () => {
    const mockData = { valid: false, errors: ['Missing name', 'Invalid spec'] }
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockData })

    const result = await validateMission({}, 'invalid.yaml')

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['Missing name', 'Invalid spec'])
  })

  it('returns quality metadata when provided by the API', async () => {
    const mockData = {
      valid: true,
      qualityPass: false,
      qualityScore: 72,
      testedOn: { platform: 'kind', version: '1.30' },
    }
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockData })

    await expect(validateMission({ metadata: { name: 'scored' } }, 'scored.yaml')).resolves.toEqual(mockData)
  })

  it('propagates API errors', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'))

    await expect(validateMission({}, 'test.yaml')).rejects.toThrow('Network error')
  })
})
