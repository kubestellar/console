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
	playlistCacheTTL = 1 * time.Hour

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
