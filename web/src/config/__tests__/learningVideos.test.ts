/**
 * Learning Videos Configuration Tests
 */
import { describe, it, expect } from 'vitest'
import {
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
  YOUTUBE_PLAYLIST_URL,
} from '../learningVideos'

describe('YouTube URL helpers', () => {
  it('getYouTubeThumbnailUrl returns valid URL', () => {
    const url = getYouTubeThumbnailUrl('abc123')
    expect(url).toBe('/api/youtube/thumbnail/abc123')
  })

  it('getYouTubeWatchUrl returns valid URL', () => {
    const url = getYouTubeWatchUrl('abc123')
    expect(url).toBe('https://www.youtube.com/watch?v=abc123')
  })

  it('YOUTUBE_PLAYLIST_URL is a valid YouTube playlist URL', () => {
    expect(YOUTUBE_PLAYLIST_URL).toContain('youtube.com/playlist')
    expect(YOUTUBE_PLAYLIST_URL).toContain('list=')
  })

  // #6696 / #6698 — video ids that happen to contain URL-reserved
  // characters must not be able to break out of the intended path or
  // inject extra query parameters into the watch URL.
  it('getYouTubeThumbnailUrl encodes path separators and special characters', () => {
    const url = getYouTubeThumbnailUrl('foo/bar?baz#qux')
    expect(url).toBe('/api/youtube/thumbnail/foo%2Fbar%3Fbaz%23qux')
    expect(url).not.toContain('foo/bar')
  })

  it('getYouTubeWatchUrl encodes ampersands so extra query params cannot be injected', () => {
    const url = getYouTubeWatchUrl('abc&malicious=1')
    // The raw & must not appear — otherwise 'malicious=1' would become a
    // second query param.
    expect(url).toBe('https://www.youtube.com/watch?v=abc%26malicious%3D1')
    expect(url).not.toContain('&malicious')
  })
})
