package handlers

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// MediumBlogHandler fetches the latest blog posts from the KubeStellar
// Medium publication RSS feed and returns them as JSON. Results are
// cached to avoid hitting Medium on every request.

const (
	// mediumFeedURL is the RSS feed for the @kubestellar Medium publication.
	mediumFeedURL = "https://medium.com/feed/@kubestellar"

	// mediumCacheTTL controls how long blog results are cached.
	mediumCacheTTL = 1 * time.Hour

	// mediumFetchTimeout is the HTTP timeout for fetching the RSS feed.
	mediumFetchTimeout = 10 * time.Second

	// mediumMaxPosts limits the number of posts returned to the frontend.
	mediumMaxPosts = 3

	// mediumPreviewMaxLen is the maximum length of the content preview snippet.
	mediumPreviewMaxLen = 200

	// mediumCutoffDate is the earliest publish date for posts to include.
	// Only posts on or after 2026-04-07 are returned.
	mediumCutoffDate = "2026-04-07"
)

// MediumPost is the JSON shape returned to the frontend.
type MediumPost struct {
	Title     string `json:"title"`
	Link      string `json:"link"`
	Published string `json:"published"`
	Preview   string `json:"preview"`
}

// mediumRSSFeed represents the Medium RSS/XML feed structure.
type mediumRSSFeed struct {
	XMLName xml.Name       `xml:"rss"`
	Channel mediumRSSChannel `xml:"channel"`
}

type mediumRSSChannel struct {
	Items []mediumRSSItem `xml:"item"`
}

type mediumRSSItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	PubDate     string `xml:"pubDate"`
	Description string `xml:"description"`
	Encoded     string `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
}

type mediumBlogCache struct {
	mu        sync.RWMutex
	posts     []MediumPost
	fetchedAt time.Time
}

var blogCache = &mediumBlogCache{}

// stripHTML removes HTML tags and returns plain text, trimmed to maxLen.
func stripHTML(html string, maxLen int) string {
	var result strings.Builder
	inTag := false
	for _, r := range html {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(r)
			if result.Len() >= maxLen {
				break
			}
		}
	}
	text := strings.TrimSpace(result.String())
	// Collapse whitespace runs
	fields := strings.Fields(text)
	return strings.Join(fields, " ")
}

func fetchMediumBlog() ([]MediumPost, error) {
	client := &http.Client{Timeout: mediumFetchTimeout}
	resp, err := client.Get(mediumFeedURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Medium feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Medium returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read feed body: %w", err)
	}

	var feed mediumRSSFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("failed to parse feed XML: %w", err)
	}

	cutoff, _ := time.Parse("2006-01-02", mediumCutoffDate)
	posts := make([]MediumPost, 0, mediumMaxPosts)

	for _, item := range feed.Channel.Items {
		// Parse Medium's RFC1123 date format
		pubTime, parseErr := time.Parse(time.RFC1123, item.PubDate)
		if parseErr != nil {
			// Try RFC1123Z as fallback
			pubTime, parseErr = time.Parse(time.RFC1123Z, item.PubDate)
			if parseErr != nil {
				continue
			}
		}

		if pubTime.Before(cutoff) {
			continue
		}

		// Use content:encoded for preview if available, else description
		content := item.Encoded
		if content == "" {
			content = item.Description
		}
		preview := stripHTML(content, mediumPreviewMaxLen)

		posts = append(posts, MediumPost{
			Title:     item.Title,
			Link:      item.Link,
			Published: pubTime.Format(time.RFC3339),
			Preview:   preview,
		})

		if len(posts) >= mediumMaxPosts {
			break
		}
	}

	return posts, nil
}

func getMediumPosts() ([]MediumPost, error) {
	blogCache.mu.RLock()
	if time.Since(blogCache.fetchedAt) < mediumCacheTTL && blogCache.posts != nil {
		posts := blogCache.posts
		blogCache.mu.RUnlock()
		return posts, nil
	}
	blogCache.mu.RUnlock()

	posts, err := fetchMediumBlog()
	if err != nil {
		// Return stale cache if available
		blogCache.mu.RLock()
		if blogCache.posts != nil {
			stale := blogCache.posts
			blogCache.mu.RUnlock()
			return stale, nil
		}
		blogCache.mu.RUnlock()
		return nil, err
	}

	blogCache.mu.Lock()
	blogCache.posts = posts
	blogCache.fetchedAt = time.Now()
	blogCache.mu.Unlock()

	return posts, nil
}

// MediumBlogHandler returns the latest blog posts from the KubeStellar
// Medium publication as JSON. Public endpoint — no auth required.
func MediumBlogHandler(c *fiber.Ctx) error {
	posts, err := getMediumPosts()
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "failed to fetch blog posts",
		})
	}

	return c.JSON(fiber.Map{
		"posts":   posts,
		"feedUrl": mediumFeedURL,
		"channelUrl": "https://medium.com/@kubestellar",
	})
}
