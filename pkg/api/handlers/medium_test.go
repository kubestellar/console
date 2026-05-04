package handlers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestMediumBlogHandler(t *testing.T) {
	// Setup Fiber app
	app := fiber.New()
	app.Get("/api/medium/blog", MediumBlogHandler)

	t.Run("Success", func(t *testing.T) {
		// Reset cache
		blogCache.mu.Lock()
		blogCache.posts = nil
		blogCache.fetchedAt = time.Time{}
		blogCache.mu.Unlock()

		// Mock HTTP client
		origClient := mediumHTTPClient
		defer func() { mediumHTTPClient = origClient }()

		mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/xml")
			fmt.Fprintln(w, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Test Post</title>
      <link>https://medium.com/test</link>
      <pubDate>Mon, 04 May 2026 12:00:00 GMT</pubDate>
      <description>&lt;p&gt;Test content&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`)
		}))
		defer mockServer.Close()

		// We can't easily change mediumFeedURL because it's a const.
		// However, we can use RoundTrip to intercept.
		mediumHTTPClient = &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				resp, _ := http.Get(mockServer.URL)
				return resp
			}),
		}

		req := httptest.NewRequest("GET", "/api/medium/blog", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("HTTPError", func(t *testing.T) {
		// Reset cache
		blogCache.mu.Lock()
		blogCache.posts = nil
		blogCache.fetchedAt = time.Time{}
		blogCache.mu.Unlock()

		origClient := mediumHTTPClient
		defer func() { mediumHTTPClient = origClient }()

		mediumHTTPClient = &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusServiceUnavailable,
					Body:       http.NoBody,
				}
			}),
		}

		req := httptest.NewRequest("GET", "/api/medium/blog", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
	})
}

func TestStripHTML(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		maxLen int
		want   string
	}{
		{"simple paragraph", "<p>Hello World</p>", 100, "Hello World"},
		{"adjacent block elements", "<div>Part 1</div><span>Part 2</span>", 100, "Part 1 Part 2"},
		{"maxLen truncation", "This is very long content", 10, "This is ve"},
		{"closing tag before comma", "<p>Hello</p>,<p>World</p>", 100, "Hello, World"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, stripHTML(tt.input, tt.maxLen))
		})
	}
}
