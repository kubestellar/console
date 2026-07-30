import { describe, it, expect } from 'vitest'
import { normalizeClusterName, hasGPUResourceRequest, extractImageTag } from '../gpu'

describe('normalizeClusterName', () => {
  it('extracts last segment from slash-separated path', () => {
    expect(normalizeClusterName('context/namespace/cluster-1')).toBe('cluster-1')
  })

  it('returns the name unchanged when no slashes', () => {
    expect(normalizeClusterName('my-cluster')).toBe('my-cluster')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeClusterName('')).toBe('')
  })

  it('handles trailing slash gracefully', () => {
    const result = normalizeClusterName('context/')
    expect(result).toBe('context/')
  })
})

describe('hasGPUResourceRequest', () => {
  it('returns true when a container requests GPUs', () => {
    expect(hasGPUResourceRequest([{ gpuRequested: 2 }])).toBe(true)
  })

  it('returns false when no GPUs requested', () => {
    expect(hasGPUResourceRequest([{ gpuRequested: 0 }])).toBe(false)
  })

  it('returns false when gpuRequested is undefined', () => {
    expect(hasGPUResourceRequest([{}])).toBe(false)
  })

  it('returns false for undefined containers', () => {
    expect(hasGPUResourceRequest(undefined)).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(hasGPUResourceRequest([])).toBe(false)
  })

  it('returns true when at least one container has GPU', () => {
    expect(hasGPUResourceRequest([{ gpuRequested: 0 }, { gpuRequested: 1 }])).toBe(true)
  })
})

describe('extractImageTag', () => {
  it('extracts tag from standard image reference', () => {
    expect(extractImageTag('nginx:1.25')).toBe('1.25')
  })

  it('returns "latest" when no tag present', () => {
    expect(extractImageTag('nginx')).toBe('latest')
  })

  it('returns "unknown" for undefined image', () => {
    expect(extractImageTag(undefined)).toBe('unknown')
  })

  it('truncates long tags (like sha256 digests)', () => {
    const longTag = 'a'.repeat(25)
    const result = extractImageTag(`registry.io/app:${longTag}`)
    expect(result.length).toBe(12)
  })

  it('handles image with registry and port', () => {
    expect(extractImageTag('registry.io:5000/app:v2.0')).toBe('v2.0')
  })
})
