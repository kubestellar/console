/**
 * YouTube video tutorial helpers.
 *
 * Videos are fetched dynamically from the YouTube playlist via
 * /api/youtube/playlist (see usePlaylistVideos hook).
 * These helpers generate thumbnail and watch URLs from a video ID.
 */

export const getYouTubeThumbnailUrl = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`

export const getYouTubeWatchUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`

export const YOUTUBE_PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD'
