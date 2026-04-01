/**
 * Learning Videos Configuration Tests
 */
import { describe, it, expect } from 'vitest'
import {
  LEARNING_VIDEOS,
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
  YOUTUBE_PLAYLIST_URL,
} from '../learningVideos'

describe('LEARNING_VIDEOS', () => {
  it('is an array', () => {
    expect(Array.isArray(LEARNING_VIDEOS)).toBe(true)
  })

  it('each video has id and title when array is populated', () => {
    LEARNING_VIDEOS.forEach(video => {
      expect(video.id).toBeTruthy()
      expect(video.title).toBeTruthy()
    })
  })
})

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
