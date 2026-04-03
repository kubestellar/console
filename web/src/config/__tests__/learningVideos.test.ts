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
    expect(url).toBe('https://img.youtube.com/vi/abc123/mqdefault.jpg')
  })

  it('getYouTubeWatchUrl returns valid URL', () => {
    const url = getYouTubeWatchUrl('abc123')
    expect(url).toBe('https://www.youtube.com/watch?v=abc123')
  })

  it('YOUTUBE_PLAYLIST_URL is a valid YouTube playlist URL', () => {
    expect(YOUTUBE_PLAYLIST_URL).toContain('youtube.com/playlist')
    expect(YOUTUBE_PLAYLIST_URL).toContain('list=')
  })
})
