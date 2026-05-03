package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

type mockYouTubeTransport struct {
	roundTrip func(*http.Request) (*http.Response, error)
}

func (m *mockYouTubeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.roundTrip(req)
}

func TestYouTubePlaylistHandler(t *testing.T) {
	app := fiber.New()
	app.Get("/youtube/playlist", YouTubePlaylistHandler)

	// Mock transport
	oldTransport := youtubeHTTPClient.Transport
	defer func() { youtubeHTTPClient.Transport = oldTransport }()

	youtubeHTTPClient.Transport = &mockYouTubeTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			if strings.Contains(req.URL.String(), "invidious") {
				return &http.Response{
					StatusCode: 200,
					Body:       io.NopCloser(strings.NewReader(`{"videos":[{"videoId":"abc","title":"Test Video"}]}`)),
					Header:     make(http.Header),
				}, nil
			}
			return &http.Response{
				StatusCode: 404,
				Body:       io.NopCloser(strings.NewReader("not found")),
				Header:     make(http.Header),
			}, nil
		},
	}

	// Reset cache for test
	cache.mu.Lock()
	cache.videos = nil
	cache.fetchedAt = time.Time{}
	cache.mu.Unlock()
	// Wait, youtube.go has 'var cache = &playlistCache{}' package level.

	req := httptest.NewRequest("GET", "/youtube/playlist", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	assert.NotNil(t, result["videos"])
	videos := result["videos"].([]interface{})
	assert.Len(t, videos, 1)
}

func TestYouTubeThumbnailProxy(t *testing.T) {
	app := fiber.New()
	app.Get("/youtube/thumbnail/:id", YouTubeThumbnailProxy)

	// Mock transport
	oldTransport := youtubeHTTPClient.Transport
	defer func() { youtubeHTTPClient.Transport = oldTransport }()

	youtubeHTTPClient.Transport = &mockYouTubeTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			if strings.Contains(req.URL.String(), "mqdefault.jpg") {
				// Real thumbnail size
				return &http.Response{
					StatusCode: 200,
					Body:       io.NopCloser(strings.NewReader(strings.Repeat("a", 2000))),
					Header:     make(http.Header),
				}, nil
			}
			return &http.Response{
				StatusCode: 404,
				Body:       io.NopCloser(strings.NewReader("not found")),
				Header:     make(http.Header),
			}, nil
		},
	}

	t.Run("Valid ID", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/youtube/thumbnail/abcdefghijk", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Equal(t, "image/jpeg", resp.Header.Get("Content-Type"))
	})

	t.Run("Invalid ID length", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/youtube/thumbnail/too-short", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 400, resp.StatusCode)
	})
}
