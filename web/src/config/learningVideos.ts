/**
 * YouTube video tutorials for the Learn dropdown.
 *
 * Add entries here as videos are published to the playlist.
 * Thumbnails and watch URLs are derived from the video ID automatically.
 */

export interface LearningVideo {
  id: string       // YouTube video ID (the ?v= parameter)
  title: string
  description?: string
}

/** Videos from the KubeStellar Console playlist */
export const LEARNING_VIDEOS: LearningVideo[] = [
  // Populated as videos are added to the playlist
]

export const getYouTubeThumbnailUrl = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`

export const getYouTubeWatchUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`

export const YOUTUBE_PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD'
