package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/safego"

	"github.com/gofiber/fiber/v2"
)

// maxBenchmarkReportBytes caps the size of a single benchmark report we will
// buffer from Google Drive. #7963 — previously downloadDriveFile called
// io.ReadAll directly on the upstream body, so a huge or malicious file id
// could OOM the server. 50 MiB is far larger than any real report (typical
// reports are <1 MiB) but small enough to bound worst-case memory per
// download.
const maxBenchmarkReportBytes = 50 * 1024 * 1024 // 50 MiB

const (
	driveAPIBase        = "https://www.googleapis.com/drive/v3/files"
	driveFolderMIME     = "application/vnd.google-apps.folder"
	defaultCacheTTL     = 1 * time.Hour
	benchmarkFilePrefix = "benchmark_report"
	benchmarkFileSuffix = ".yaml"

	// Rate limiting for Google Drive API to avoid triggering anti-bot protection.
	driveRequestDelay   = 100 * time.Millisecond
	driveMaxRetries     = 3
	driveRetryBaseDelay = 2 * time.Second
	driveUserAgent      = "KubeStellarConsole/1.0"

	// driveFetchConcurrency bounds how many experiment/run folders are
	// processed in parallel. The throttle() mutex still enforces per-request
	// rate-limiting, so increasing this number speeds up folder listing and
	// file downloads without exceeding the Drive API rate limit.
	driveFetchConcurrency = 8
)

// parseSinceDuration parses a shorthand duration like "30d", "7d", "90d".
// Returns 0 if the value is "0" or empty (meaning no filter).
func parseSinceDuration(s string) time.Duration {
	s = strings.TrimSpace(s)
	if s == "" || s == "0" || s == "0d" {
		return 0
	}
	if strings.HasSuffix(s, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(s, "d"))
		if err == nil && days > 0 {
			return time.Duration(days) * 24 * time.Hour
		}
	}
	return 0
}

// normalizeSinceKey returns a canonical cache key for the since parameter.
// Semantically identical inputs ("0", "0d", "") all map to "0".
func normalizeSinceKey(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "0" || s == "0d" {
		return "0"
	}
	return s
}

// parseDriveTime parses an RFC3339 timestamp from the Google Drive API.
func parseDriveTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

// isAfterCutoff returns true if the file should be included (created after cutoff).
// If cutoff is zero or the file has no created time, always includes it.
func isAfterCutoff(f driveFile, cutoff time.Time) bool {
	if cutoff.IsZero() {
		return true
	}
	created, ok := parseDriveTime(f.CreatedTime)
	if !ok {
		return true // no timestamp — include by default
	}
	return !created.Before(cutoff)
}

// BenchmarkHandlers provides endpoints for llm-d benchmark data from Google Drive.
type BenchmarkHandlers struct {
	apiKey   string
	folderID string
	cache    *benchmarkCache
	client   *http.Client
	lastReq  time.Time
	reqMu    sync.Mutex
}

type benchmarkCache struct {
	mu        sync.RWMutex
	reports   []BenchmarkReport
	since     string
	fetchedAt time.Time
	ttl       time.Duration
}

func (c *benchmarkCache) get(since string) ([]BenchmarkReport, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.reports == nil || time.Since(c.fetchedAt) > c.ttl || c.since != since {
		return nil, false
	}
	return c.reports, true
}

func (c *benchmarkCache) set(reports []BenchmarkReport, since string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.reports = reports
	c.since = since
	c.fetchedAt = time.Now()
}

// NewBenchmarkHandlers creates a new benchmark data handler.
func NewBenchmarkHandlers(apiKey, folderID string) *BenchmarkHandlers {
	return &BenchmarkHandlers{
		apiKey:   apiKey,
		folderID: folderID,
		cache: &benchmarkCache{
			ttl: defaultCacheTTL,
		},
		client: client.External,
	}
}

// GetReports returns benchmark reports adapted from Google Drive v0.1 data to v0.2 format.
func (h *BenchmarkHandlers) GetReports(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"reports": []interface{}{}, "source": "demo"})
	}

	if h.apiKey == "" {
		return c.Status(503).JSON(fiber.Map{
			"error":  "benchmark data not configured — set GOOGLE_DRIVE_API_KEY",
			"source": "unavailable",
		})
	}

	since := normalizeSinceKey(c.Query("since", "0"))
	if reports, ok := h.cache.get(since); ok {
		return c.JSON(fiber.Map{"reports": reports, "source": "cache"})
	}

	var cutoff time.Time
	if d := parseSinceDuration(since); d > 0 {
		cutoff = time.Now().Add(-d)
	}

	reports, parseFailures, err := h.fetchAllReports(c.UserContext(), cutoff)
	if err != nil {
		slog.Error("[benchmarks] Google Drive fetch error", "error", err)
		h.cache.mu.RLock()
		stale := h.cache.reports
		h.cache.mu.RUnlock()
		if stale != nil {
			return c.JSON(fiber.Map{"reports": stale, "source": "stale-cache", "error": "failed to refresh benchmark data"})
		}
		return c.Status(502).JSON(fiber.Map{"error": "failed to fetch benchmark data"})
	}

	h.cache.set(reports, since)
	slog.Info("[benchmarks] fetched reports from Google Drive", "count", len(reports), "since", since, "parseFailures", parseFailures)
	resp := fiber.Map{"reports": reports, "source": "live"}
	if parseFailures > 0 {
		resp["parse_failures"] = parseFailures
	}
	return c.JSON(resp)
}

// StreamReports streams benchmark reports via SSE as they are fetched from Google Drive.
// Sends individual reports as they are parsed for fast first paint.
// Sends keepalive heartbeats every 5s so the connection doesn't drop during long fetches.
// Events: "batch" (reports array), "progress" (status update), "done" (final summary), "error".
func (h *BenchmarkHandlers) StreamReports(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"reports": []interface{}{}, "source": "demo"})
	}
	if h.apiKey == "" {
		return c.Status(503).JSON(fiber.Map{
			"error":  "benchmark data not configured — set GOOGLE_DRIVE_API_KEY",
			"source": "unavailable",
		})
	}

	since := normalizeSinceKey(c.Query("since", "0"))
	if reports, ok := h.cache.get(since); ok {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		batch, err := json.Marshal(reports)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "failed to marshal benchmark reports")
		}
		fmt.Fprintf(c, "event: batch\ndata: %s\n\n", batch)
		fmt.Fprintf(c, "event: done\ndata: {\"total\":%d,\"source\":\"cache\"}\n\n", len(reports))
		return nil
	}

	var cutoff time.Time
	if d := parseSinceDuration(since); d > 0 {
		cutoff = time.Now().Add(-d)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	reqCtx := c.UserContext()
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		ctx, cancel := context.WithCancel(reqCtx)
		defer cancel()

		allReports := make([]BenchmarkReport, 0)
		totalSent := 0
		skippedFolders := 0
		totalParseFailures := 0

		const batchSize = 8
		pendingBatch := make([]BenchmarkReport, 0)

		safeFlush := func() {
			if err := w.Flush(); err != nil {
				slog.Info("[benchmarks] client disconnected, cancelling stream", "error", err)
				cancel()
			}
		}

		flushBatch := func() {
			if len(pendingBatch) == 0 || ctx.Err() != nil {
				return
			}
			batch, err := json.Marshal(pendingBatch)
			if err != nil {
				slog.Error("[benchmarks] failed to marshal batch", "error", err)
				return
			}
			fmt.Fprintf(w, "event: batch\ndata: %s\n\n", batch)
			safeFlush()
			slog.Info("[benchmarks] flushed batch", "batchSize", len(pendingBatch), "totalSent", totalSent)
			pendingBatch = pendingBatch[:0]
		}

		fmt.Fprintf(w, "event: progress\ndata: {\"status\":\"connecting\",\"total\":0}\n\n")
		safeFlush()
		if ctx.Err() != nil {
			return
		}

		var streamMu sync.Mutex
		keepaliveDone := make(chan struct{})
		safego.Go(func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					streamMu.Lock()
					fmt.Fprintf(w, ": keepalive\n\n")
					safeFlush()
					streamMu.Unlock()
				case <-keepaliveDone:
					return
				case <-ctx.Done():
					return
				}
			}
		})
		defer close(keepaliveDone)

		topLevel, err := h.listDriveFolder(ctx, h.folderID)
		if err != nil {
			if ctx.Err() != nil {
				slog.Info("[benchmarks] stream cancelled during folder listing")
				return
			}
			slog.Info("[benchmarks] error listing drive folder", "error", err)
			fmt.Fprintf(w, "event: error\ndata: {\"error\":\"failed to fetch benchmark data\"}\n\n")
			safeFlush()
			return
		}

		experiments := make([]driveFile, 0, len(topLevel))
		for _, item := range topLevel {
			if item.MimeType != driveFolderMIME {
				continue
			}
			if !isAfterCutoff(item, cutoff) {
				skippedFolders++
				continue
			}
			experiments = append(experiments, item)
		}

		if skippedFolders > 0 {
			slog.Info("[benchmarks] skipped old experiment folders", "skipped", skippedFolders, "since", since)
		}
		fmt.Fprintf(w, "event: progress\ndata: {\"status\":\"fetching\",\"experiments\":%d,\"total\":0,\"skipped\":%d}\n\n", len(experiments), skippedFolders)
		safeFlush()

		var streamWg sync.WaitGroup
		streamSem := make(chan struct{}, driveFetchConcurrency)
		innerSem := make(chan struct{}, driveFetchConcurrency)

		for _, item := range experiments {
			if ctx.Err() != nil {
				break
			}
			item := item
			streamWg.Add(1)
			select {
			case streamSem <- struct{}{}:
			case <-ctx.Done():
				streamWg.Done()
				continue
			}
			safego.Go(func() {
				defer streamWg.Done()
				defer func() { <-streamSem }()

				if ctx.Err() != nil {
					return
				}
				runFolders, listErr := h.listDriveFolder(ctx, item.ID)
				if listErr != nil {
					if ctx.Err() == nil {
						slog.Error("[benchmarks] error listing experiment", "experiment", item.Name, "error", listErr)
					}
					return
				}

				var innerWg sync.WaitGroup
				for _, runItem := range runFolders {
					if ctx.Err() != nil {
						break
					}
					if runItem.MimeType != driveFolderMIME {
						continue
					}
					if !isAfterCutoff(runItem, cutoff) {
						streamMu.Lock()
						skippedFolders++
						streamMu.Unlock()
						continue
					}
					runItem := runItem
					innerWg.Add(1)
					select {
					case innerSem <- struct{}{}:
					case <-ctx.Done():
						innerWg.Done()
						continue
					}
					safego.Go(func() {
						defer innerWg.Done()
						defer func() { <-innerSem }()

						if ctx.Err() != nil {
							return
						}
						reports, failures, runErr := h.fetchRunFolderStreaming(ctx, runItem.ID, item.Name, runItem.Name, func(report BenchmarkReport) {
							streamMu.Lock()
							allReports = append(allReports, report)
							totalSent++
							pendingBatch = append(pendingBatch, report)
							if len(pendingBatch) >= batchSize {
								flushBatch()
							}
							streamMu.Unlock()
						})
						streamMu.Lock()
						totalParseFailures += failures
						streamMu.Unlock()
						if runErr != nil {
							if ctx.Err() == nil {
								slog.Error("[benchmarks] error in experiment run", "experiment", item.Name, "run", runItem.Name, "error", runErr)
							}
							return
						}
						streamMu.Lock()
						if len(pendingBatch) > 0 {
							flushBatch()
						}
						sentSnapshot := totalSent
						streamMu.Unlock()
						if len(reports) > 0 {
							slog.Info("[benchmarks] streamed reports", "count", len(reports), "experiment", item.Name, "run", runItem.Name, "totalSent", sentSnapshot)
						}
					})
				}
				innerWg.Wait()
			})
		}
		streamWg.Wait()
		flushBatch()

		if ctx.Err() != nil {
			slog.Info("[benchmarks] stream cancelled, skipping cache update", "totalSent", totalSent)
			return
		}

		h.cache.set(allReports, since)
		slog.Info("[benchmarks] stream complete", "totalSent", totalSent, "skipped", skippedFolders, "parseFailures", totalParseFailures, "since", since)
		fmt.Fprintf(w, "event: done\ndata: {\"total\":%d,\"source\":\"live\",\"parse_failures\":%d}\n\n", totalSent, totalParseFailures)
		safeFlush()
	})

	return nil
}
