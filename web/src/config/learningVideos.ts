/**
 * YouTube video tutorial helpers.
 *
 * Videos are fetched dynamically from the YouTube playlist via
 * /api/youtube/playlist (see usePlaylistVideos hook).
 * These helpers generate thumbnail and watch URLs from a video ID.
 */

export const getYouTubeThumbnailUrl = (videoId: string) =>
  // Encode the videoId so stray characters like '/', '?', '#', or '..' can't
  // break out of the thumbnail path or produce an invalid URL.
  `/api/youtube/thumbnail/${encodeURIComponent(videoId)}`

export const getYouTubeWatchUrl = (videoId: string) =>
  // Encode the videoId so it can't tamper with the query string (e.g. a
  // videoId containing '&foo=bar' would inject extra params).
  `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`

export const YOUTUBE_PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD'
