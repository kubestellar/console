package handlers

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// YouTubePlaylistHandler fetches videos from a YouTube playlist RSS feed
// and returns them as JSON. Results are cached to avoid hitting YouTube
// on every request.

const (
	// playlistID is the KubeStellar Console tutorials playlist.
	playlistID = "PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD"

	// playlistCacheTTL controls how long playlist results are cached.
	playlistCacheTTL = 5 * time.Minute

	// playlistFetchTimeout is the HTTP timeout for fetching the RSS feed.
	playlistFetchTimeout = 10 * time.Second
)

// PlaylistVideo is the JSON shape returned to the frontend.
type PlaylistVideo struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Published   string `json:"published,omitempty"`
}

// youtubeAtomFeed represents the YouTube RSS/Atom feed XML structure.
type youtubeAtomFeed struct {
	XMLName xml.Name          `xml:"feed"`
	Entries []youtubeAtomEntry `xml:"entry"`
}

type youtubeAtomEntry struct {
	Title     string `xml:"title"`
	Published string `xml:"published"`
	VideoID   string `xml:"http://www.youtube.com/xml/schemas/2015 videoId"`
	Group     struct {
		Description string `xml:"http://search.yahoo.com/mrss/ description"`
	} `xml:"http://search.yahoo.com/mrss/ group"`
}

type playlistCache struct {
	mu        sync.RWMutex
	videos    []PlaylistVideo
	fetchedAt time.Time
}

var cache = &playlistCache{}

func fetchPlaylistFromYouTube() ([]PlaylistVideo, error) {
	url := fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?playlist_id=%s", playlistID)

	client := &http.Client{Timeout: playlistFetchTimeout}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch playlist feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("YouTube returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read feed body: %w", err)
	}

	var feed youtubeAtomFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("failed to parse feed XML: %w", err)
	}

	videos := make([]PlaylistVideo, 0, len(feed.Entries))
	for _, entry := range feed.Entries {
		videos = append(videos, PlaylistVideo{
			ID:          entry.VideoID,
			Title:       entry.Title,
			Description: entry.Group.Description,
			Published:   entry.Published,
		})
	}

	return videos, nil
}

func getPlaylistVideos() ([]PlaylistVideo, error) {
	cache.mu.RLock()
	if time.Since(cache.fetchedAt) < playlistCacheTTL && cache.videos != nil {
		videos := cache.videos
		cache.mu.RUnlock()
		return videos, nil
	}
	cache.mu.RUnlock()

	videos, err := fetchPlaylistFromYouTube()
	if err != nil {
		// Return stale cache if available
		cache.mu.RLock()
		if cache.videos != nil {
			stale := cache.videos
			cache.mu.RUnlock()
			return stale, nil
		}
		cache.mu.RUnlock()
		return nil, err
	}

	cache.mu.Lock()
	cache.videos = videos
	cache.fetchedAt = time.Now()
	cache.mu.Unlock()

	return videos, nil
}

// YouTubePlaylistHandler returns the videos in the KubeStellar Console
// YouTube playlist as JSON. Public endpoint — no auth required.
func YouTubePlaylistHandler(c *fiber.Ctx) error {
	videos, err := getPlaylistVideos()
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error":  "failed to fetch playlist",
			"detail": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"videos":     videos,
		"playlistId": playlistID,
		"playlistUrl": fmt.Sprintf(
			"https://www.youtube.com/playlist?list=%s", playlistID,
		),
	})
}

// youtubeVideoIDLen is the standard length of a YouTube video ID (11 characters).
const youtubeVideoIDLen = 11

// youtubeDefaultThumbnailMaxBytes is the maximum size of YouTube's default
// placeholder thumbnail returned for non-existent video IDs. Real thumbnails
// are typically larger than this.
const youtubeDefaultThumbnailMaxBytes = 1200

// YouTubeThumbnailProxy proxies a YouTube video thumbnail image through
// the backend, avoiding MSW/CORS issues in demo mode.
// Route: GET /api/youtube/thumbnail/:id
func YouTubeThumbnailProxy(c *fiber.Ctx) error {
	videoID := c.Params("id")
	if videoID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing video id"})
	}

	// YouTube video IDs are exactly 11 characters: [A-Za-z0-9_-]
	if len(videoID) != youtubeVideoIDLen {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid video id: must be 11 characters"})
	}
	for _, ch := range videoID {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_') {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid video id"})
		}
	}

	thumbURL := fmt.Sprintf("https://img.youtube.com/vi/%s/mqdefault.jpg", videoID)

	client := &http.Client{Timeout: playlistFetchTimeout}
	resp, err := client.Get(thumbURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).SendString("failed to fetch thumbnail")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "thumbnail not found"})
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).SendString("failed to read thumbnail")
	}

	// YouTube returns a tiny default placeholder image for non-existent video IDs
	// instead of a 404. Detect this by checking the response size — real thumbnails
	// are significantly larger than the ~1KB placeholder.
	if len(body) < youtubeDefaultThumbnailMaxBytes {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "video not found"})
	}

	c.Set("Content-Type", "image/jpeg")
	c.Set("Cache-Control", "public, max-age=86400")
	return c.Send(body)
}
