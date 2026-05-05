package handlers

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/singleflight"
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

	// maxYouTubeResponseBytes caps external YouTube/RSS response reads to
	// prevent memory exhaustion from unexpectedly large responses. #7064.
	maxYouTubeResponseBytes = 5 * 1024 * 1024 // 5 MB
)

// youtubeHTTPClient is a package-level shared HTTP client for YouTube
// fetches so TCP connections are reused across requests. #7065.
var youtubeHTTPClient = &http.Client{Timeout: playlistFetchTimeout}

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

// playlistSingleflight coalesces concurrent cold-cache fetches into a
// single external API call to prevent cache stampede. #7066.
var playlistSingleflight singleflight.Group

func fetchPlaylistFromYouTube() ([]PlaylistVideo, error) {
	// Primary: Invidious API (reliable, no auth required).
	videos, invErr := fetchPlaylistViaInvidious()
	if invErr == nil && len(videos) > 0 {
		return videos, nil
	}

	// Fallback 1: RSS feed.
	videos, rssErr := fetchPlaylistViaRSS()
	if rssErr == nil && len(videos) > 0 {
		return videos, nil
	}

	// Fallback 2: yt-dlp (handles playlists where RSS returns 404).
	videos, ytErr := fetchPlaylistViaYTDLP()
	if ytErr == nil && len(videos) > 0 {
		return videos, nil
	}

	// All failed — return the most informative error.
	if invErr != nil {
		return nil, invErr
	}
	if rssErr != nil {
		return nil, rssErr
	}
	return nil, ytErr
}

// invidiousInstances is a list of public Invidious API instances tried in order.
// These provide a YouTube-compatible JSON API without requiring auth.
var invidiousInstances = []string{
	"https://inv.nadeko.net",
	"https://invidious.fdn.fr",
	"https://vid.puffyan.us",
}

// invidiousPlaylistVideo is the JSON shape from /api/v1/playlists/:id.
type invidiousPlaylistVideo struct {
	VideoID string `json:"videoId"`
	Title   string `json:"title"`
}

type invidiousPlaylistResp struct {
	Videos []invidiousPlaylistVideo `json:"videos"`
}

func fetchPlaylistViaInvidious() ([]PlaylistVideo, error) {
	var lastErr error
	for _, instance := range invidiousInstances {
		apiURL := fmt.Sprintf("%s/api/v1/playlists/%s", instance, playlistID)
		resp, err := youtubeHTTPClient.Get(apiURL)
		if err != nil {
			lastErr = fmt.Errorf("invidious %s: %w", instance, err)
			continue
		}

		body, err := func() ([]byte, error) {
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return nil, fmt.Errorf("invidious %s returned %d", instance, resp.StatusCode)
			}
			b, err := io.ReadAll(io.LimitReader(resp.Body, maxYouTubeResponseBytes))
			if err != nil {
				return nil, fmt.Errorf("invidious %s read: %w", instance, err)
			}
			return b, nil
		}()
		if err != nil {
			lastErr = err
			continue
		}

		var playlist invidiousPlaylistResp
		if err := json.Unmarshal(body, &playlist); err != nil {
			lastErr = fmt.Errorf("invidious %s parse: %w", instance, err)
			continue
		}

		if len(playlist.Videos) == 0 {
			lastErr = fmt.Errorf("invidious %s: empty playlist", instance)
			continue
		}

		videos := make([]PlaylistVideo, 0, len(playlist.Videos))
		for _, v := range playlist.Videos {
			videos = append(videos, PlaylistVideo{
				ID:    v.VideoID,
				Title: v.Title,
			})
		}
		return videos, nil
	}
	return nil, lastErr
}

func fetchPlaylistViaRSS() ([]PlaylistVideo, error) {
	url := fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?playlist_id=%s", playlistID)

	resp, err := youtubeHTTPClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch playlist feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("YouTube RSS returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxYouTubeResponseBytes))
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

// ytdlpVideoJSON is the shape yt-dlp emits with --flat-playlist --dump-json.
type ytdlpVideoJSON struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

func fetchPlaylistViaYTDLP() ([]PlaylistVideo, error) {
	ytdlp, err := exec.LookPath("yt-dlp")
	if err != nil {
		return nil, fmt.Errorf("yt-dlp not found: %w", err)
	}

	playlistURL := fmt.Sprintf("https://www.youtube.com/playlist?list=%s", playlistID)
	cmd := exec.Command(ytdlp, "--flat-playlist", "--dump-json", "--no-warnings", playlistURL)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp failed: %w", err)
	}

	var videos []PlaylistVideo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		var v ytdlpVideoJSON
		if err := json.Unmarshal([]byte(line), &v); err != nil {
			continue
		}
		videos = append(videos, PlaylistVideo{
			ID:    v.ID,
			Title: v.Title,
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

	// #7066: use singleflight to coalesce concurrent cold-cache fetches.
	result, err, _ := playlistSingleflight.Do("playlist", func() (interface{}, error) {
		// Re-check cache inside singleflight — another caller may have
		// already populated it.
		cache.mu.RLock()
		if time.Since(cache.fetchedAt) < playlistCacheTTL && cache.videos != nil {
			videos := cache.videos
			cache.mu.RUnlock()
			return videos, nil
		}
		cache.mu.RUnlock()

		videos, fetchErr := fetchPlaylistFromYouTube()
		if fetchErr != nil {
			// Return stale cache if available
			cache.mu.RLock()
			if cache.videos != nil {
				stale := cache.videos
				cache.mu.RUnlock()
				return stale, nil
			}
			cache.mu.RUnlock()
			return nil, fetchErr
		}

		cache.mu.Lock()
		cache.videos = videos
		cache.fetchedAt = time.Now()
		cache.mu.Unlock()

		return videos, nil
	})
	if err != nil {
		return nil, err
	}
	return result.([]PlaylistVideo), nil
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

	// #7065: reuse shared HTTP client for connection pooling.
	resp, err := youtubeHTTPClient.Get(thumbURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).SendString("failed to fetch thumbnail")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "thumbnail not found"})
	}

	// #7064: limit response body to prevent memory exhaustion.
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxYouTubeResponseBytes))
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
