package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"gopkg.in/yaml.v3"
)

// maxBenchmarkReportBytes caps the size of a single benchmark report we will
// buffer from Google Drive. #7963 — previously downloadDriveFile called
// io.ReadAll directly on the upstream body, so a huge or malicious file id
// could OOM the server. 50 MiB is far larger than any real report (typical
// reports are <1 MiB) but small enough to bound worst-case memory per
// download.
const maxBenchmarkReportBytes = 50 * 1024 * 1024 // 50 MiB

// ---------------------------------------------------------------------------
// v0.2 output structs — match the TypeScript BenchmarkReport interface
// ---------------------------------------------------------------------------

type BenchmarkStatistics struct {
	Units  string   `json:"units"`
	Mean   float64  `json:"mean"`
	Min    *float64 `json:"min,omitempty"`
	P0p1   *float64 `json:"p0p1,omitempty"`
	P1     *float64 `json:"p1,omitempty"`
	P5     *float64 `json:"p5,omitempty"`
	P10    *float64 `json:"p10,omitempty"`
	P25    *float64 `json:"p25,omitempty"`
	P50    *float64 `json:"p50,omitempty"`
	P75    *float64 `json:"p75,omitempty"`
	P90    *float64 `json:"p90,omitempty"`
	P95    *float64 `json:"p95,omitempty"`
	P99    *float64 `json:"p99,omitempty"`
	P99p9  *float64 `json:"p99p9,omitempty"`
	Max    *float64 `json:"max,omitempty"`
	Stddev *float64 `json:"stddev,omitempty"`
}

type BenchmarkAccelerator struct {
	Model       string                `json:"model"`
	Count       int                   `json:"count"`
	Memory      *int                  `json:"memory,omitempty"`
	Parallelism *BenchmarkParallelism `json:"parallelism,omitempty"`
}

type BenchmarkParallelism struct {
	DP int `json:"dp"`
	TP int `json:"tp"`
	PP int `json:"pp"`
	EP int `json:"ep"`
}

type BenchmarkStackComponent struct {
	Metadata struct {
		Label       string `json:"label"`
		CfgID       string `json:"cfg_id"`
		Description string `json:"description,omitempty"`
	} `json:"metadata"`
	Standardized struct {
		Kind        string                `json:"kind"`
		Tool        string                `json:"tool"`
		ToolVersion string                `json:"tool_version"`
		Role        string                `json:"role,omitempty"`
		Replicas    *int                  `json:"replicas,omitempty"`
		Model       *BenchmarkModelRef    `json:"model,omitempty"`
		Accelerator *BenchmarkAccelerator `json:"accelerator,omitempty"`
	} `json:"standardized"`
}

type BenchmarkModelRef struct {
	Name         string `json:"name"`
	Quantization string `json:"quantization,omitempty"`
}

type BenchmarkLoadConfig struct {
	Metadata struct {
		CfgID       string `json:"cfg_id"`
		Description string `json:"description,omitempty"`
	} `json:"metadata"`
	Standardized struct {
		Tool         string                 `json:"tool"`
		ToolVersion  string                 `json:"tool_version"`
		Source       string                 `json:"source"`
		InputSeqLen  *BenchmarkDistribution `json:"input_seq_len,omitempty"`
		OutputSeqLen *BenchmarkDistribution `json:"output_seq_len,omitempty"`
		RateQPS      *float64               `json:"rate_qps,omitempty"`
		Concurrency  *int                   `json:"concurrency,omitempty"`
	} `json:"standardized"`
}

type BenchmarkDistribution struct {
	Distribution string  `json:"distribution"`
	Value        float64 `json:"value"`
}

type BenchmarkLatencyStats struct {
	TimeToFirstToken             *BenchmarkStatistics `json:"time_to_first_token,omitempty"`
	TimePerOutputToken           *BenchmarkStatistics `json:"time_per_output_token,omitempty"`
	InterTokenLatency            *BenchmarkStatistics `json:"inter_token_latency,omitempty"`
	NormalizedTimePerOutputToken *BenchmarkStatistics `json:"normalized_time_per_output_token,omitempty"`
	RequestLatency               *BenchmarkStatistics `json:"request_latency,omitempty"`
}

type BenchmarkThroughputStats struct {
	InputTokenRate  *BenchmarkStatistics `json:"input_token_rate,omitempty"`
	OutputTokenRate *BenchmarkStatistics `json:"output_token_rate,omitempty"`
	TotalTokenRate  *BenchmarkStatistics `json:"total_token_rate,omitempty"`
	RequestRate     *BenchmarkStatistics `json:"request_rate,omitempty"`
}

type BenchmarkRequestStats struct {
	Total        int                  `json:"total"`
	Failures     int                  `json:"failures"`
	Incomplete   *int                 `json:"incomplete,omitempty"`
	InputLength  *BenchmarkStatistics `json:"input_length,omitempty"`
	OutputLength *BenchmarkStatistics `json:"output_length,omitempty"`
}

type BenchmarkReport struct {
	Version string `json:"version"`
	Run     struct {
		UID  string `json:"uid"`
		EID  string `json:"eid"`
		CID  string `json:"cid,omitempty"`
		Time struct {
			Start    string `json:"start"`
			End      string `json:"end"`
			Duration string `json:"duration"`
		} `json:"time"`
		User string `json:"user"`
	} `json:"run"`
	Scenario struct {
		Stack []BenchmarkStackComponent `json:"stack"`
		Load  BenchmarkLoadConfig       `json:"load"`
	} `json:"scenario"`
	Results struct {
		RequestPerformance struct {
			Aggregate struct {
				Requests   BenchmarkRequestStats    `json:"requests"`
				Latency    BenchmarkLatencyStats    `json:"latency"`
				Throughput BenchmarkThroughputStats `json:"throughput"`
			} `json:"aggregate"`
		} `json:"request_performance"`
		Observability *struct {
			Metrics []interface{} `json:"metrics,omitempty"`
		} `json:"observability,omitempty"`
		ComponentHealth []interface{} `json:"component_health,omitempty"`
	} `json:"results"`
}

// ---------------------------------------------------------------------------
// v0.1 raw YAML structures — match the actual benchmark output
// ---------------------------------------------------------------------------

type rawV1Statistics struct {
	Units string   `yaml:"units" json:"units"`
	Mean  float64  `yaml:"mean" json:"mean"`
	Min   *float64 `yaml:"min" json:"min"`
	P0p1  *float64 `yaml:"p0p1" json:"p0p1"`
	P1    *float64 `yaml:"p1" json:"p1"`
	P5    *float64 `yaml:"p5" json:"p5"`
	P10   *float64 `yaml:"p10" json:"p10"`
	P25   *float64 `yaml:"p25" json:"p25"`
	P50   *float64 `yaml:"p50" json:"p50"`
	P75   *float64 `yaml:"p75" json:"p75"`
	P90   *float64 `yaml:"p90" json:"p90"`
	P95   *float64 `yaml:"p95" json:"p95"`
	P99   *float64 `yaml:"p99" json:"p99"`
	P99p9 *float64 `yaml:"p99p9" json:"p99p9"`
	Max   *float64 `yaml:"max" json:"max"`
}

type rawV1Report struct {
	Version string `yaml:"version"`
	Metrics struct {
		Latency struct {
			TimeToFirstToken             *rawV1Statistics `yaml:"time_to_first_token"`
			TimePerOutputToken           *rawV1Statistics `yaml:"time_per_output_token"`
			InterTokenLatency            *rawV1Statistics `yaml:"inter_token_latency"`
			NormalizedTimePerOutputToken *rawV1Statistics `yaml:"normalized_time_per_output_token"`
			RequestLatency               *rawV1Statistics `yaml:"request_latency"`
		} `yaml:"latency"`
		Throughput struct {
			OutputTokensPerSec float64 `yaml:"output_tokens_per_sec"`
			RequestsPerSec     float64 `yaml:"requests_per_sec"`
			TotalTokensPerSec  float64 `yaml:"total_tokens_per_sec"`
		} `yaml:"throughput"`
		Requests struct {
			Total        int              `yaml:"total"`
			Failures     int              `yaml:"failures"`
			InputLength  *rawV1Statistics `yaml:"input_length"`
			OutputLength *rawV1Statistics `yaml:"output_length"`
		} `yaml:"requests"`
		Time struct {
			Duration float64 `yaml:"duration"`
		} `yaml:"time"`
	} `yaml:"metrics"`
	Scenario struct {
		Host struct {
			Accelerator []struct {
				Count       int    `yaml:"count"`
				Model       string `yaml:"model"`
				Parallelism struct {
					DP int `yaml:"dp"`
					EP int `yaml:"ep"`
					PP int `yaml:"pp"`
					TP int `yaml:"tp"`
				} `yaml:"parallelism"`
			} `yaml:"accelerator"`
			Type []string `yaml:"type"`
		} `yaml:"host"`
		Load struct {
			Args struct {
				Data struct {
					Type         string `yaml:"type"`
					SharedPrefix struct {
						NumGroups          int `yaml:"num_groups"`
						NumPromptsPerGroup int `yaml:"num_prompts_per_group"`
						OutputLen          int `yaml:"output_len"`
						QuestionLen        int `yaml:"question_len"`
						SystemPromptLen    int `yaml:"system_prompt_len"`
					} `yaml:"shared_prefix"`
				} `yaml:"data"`
				Load struct {
					Type   string `yaml:"type"`
					Stages []struct {
						Rate     float64 `yaml:"rate"`
						Duration int     `yaml:"duration"`
					} `yaml:"stages"`
					NumWorkers int `yaml:"num_workers"`
				} `yaml:"load"`
				Server struct {
					Type      string `yaml:"type"`
					ModelName string `yaml:"model_name"`
					BaseURL   string `yaml:"base_url"`
					IgnoreEOS bool   `yaml:"ignore_eos"`
				} `yaml:"server"`
			} `yaml:"args"`
			Metadata struct {
				Stage int `yaml:"stage"`
			} `yaml:"metadata"`
			Name string `yaml:"name"`
		} `yaml:"load"`
		Model struct {
			Name string `yaml:"name"`
		} `yaml:"model"`
		Platform struct {
			Engine []struct {
				Name string                 `yaml:"name"`
				Args map[string]interface{} `yaml:"args"`
			} `yaml:"engine"`
			Metadata map[string]interface{} `yaml:"metadata"`
		} `yaml:"platform"`
	} `yaml:"scenario"`
}

// ---------------------------------------------------------------------------
// Google Drive API response types
// ---------------------------------------------------------------------------

type driveFileList struct {
	Files         []driveFile `json:"files"`
	NextPageToken string      `json:"nextPageToken,omitempty"`
}

type driveFile struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	MimeType    string `json:"mimeType"`
	CreatedTime string `json:"createdTime"`
}

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

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const (
	driveAPIBase        = "https://www.googleapis.com/drive/v3/files"
	driveFolderMIME     = "application/vnd.google-apps.folder"
	defaultCacheTTL     = 1 * time.Hour
	benchmarkFilePrefix = "benchmark_report"
	benchmarkFileSuffix = ".yaml"

	// Rate limiting for Google Drive API to avoid triggering anti-bot protection
	driveRequestDelay   = 100 * time.Millisecond
	driveMaxRetries     = 3
	driveRetryBaseDelay = 2 * time.Second
	driveUserAgent      = "KubeStellarConsole/1.0"

	// driveFetchConcurrency bounds how many experiment/run folders are
	// processed in parallel.  The throttle() mutex still enforces per-request
	// rate-limiting, so increasing this number speeds up folder listing and
	// file downloads without exceeding the Drive API rate limit.
	driveFetchConcurrency = 8
)

// BenchmarkHandlers provides endpoints for llm-d benchmark data from Google Drive.
type BenchmarkHandlers struct {
	apiKey   string
	folderID string
	cache    *benchmarkCache
	client   *http.Client
	lastReq  time.Time
	reqMu    sync.Mutex
}

// NewBenchmarkHandlers creates a new benchmark data handler.
func NewBenchmarkHandlers(apiKey, folderID string) *BenchmarkHandlers {
	return &BenchmarkHandlers{
		apiKey:   apiKey,
		folderID: folderID,
		cache: &benchmarkCache{
			ttl: defaultCacheTTL,
		},
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// throttle ensures a minimum delay between Google Drive API requests
// to avoid triggering anti-bot protection.
// The lock is only held briefly to read/update timestamps; the actual
// sleep (if needed) happens outside the lock so concurrent goroutines
// are not blocked for the full delay.
// The context is checked so that cancellation is not blocked by sleep.
func (h *BenchmarkHandlers) throttle(ctx context.Context) error {
	h.reqMu.Lock()
	elapsed := time.Since(h.lastReq)
	if elapsed >= driveRequestDelay {
		h.lastReq = time.Now()
		h.reqMu.Unlock()
		return ctx.Err()
	}
	delay := driveRequestDelay - elapsed
	h.lastReq = time.Now().Add(delay) // reserve a future slot
	h.reqMu.Unlock()
	select {
	case <-time.After(delay):
		return nil
	case <-ctx.Done():
		// Restore lastReq so the cancelled reservation does not block future
		// requests: the slot was never used, so we clear it to zero time.
		h.reqMu.Lock()
		h.lastReq = time.Time{}
		h.reqMu.Unlock()
		return ctx.Err()
	}
}

// driveGet performs a throttled HTTP GET with the proper User-Agent header.
// The context is used to cancel in-flight requests when the client disconnects.
func (h *BenchmarkHandlers) driveGet(ctx context.Context, url string) (*http.Response, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := h.throttle(ctx); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", driveUserAgent)
	return h.client.Do(req)
}

// driveGetWithRetry performs an HTTP GET with throttling and retry on 403 errors.
func (h *BenchmarkHandlers) driveGetWithRetry(ctx context.Context, url string) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt <= driveMaxRetries; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if attempt > 0 {
			backoff := driveRetryBaseDelay * time.Duration(1<<(attempt-1))
			slog.Info("[benchmarks] retrying", "backoff", backoff, "attempt", attempt, "maxRetries", driveMaxRetries)
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		resp, err := h.driveGet(ctx, url)
		if err != nil {
			lastErr = fmt.Errorf("HTTP error: %w", err)
			continue
		}
		if resp.StatusCode == 403 || resp.StatusCode == 429 {
			func() {
				defer resp.Body.Close()
				body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBenchmarkReportBytes))
				if readErr != nil {
					body = []byte("(failed to read response body)")
				}
				lastErr = fmt.Errorf("Drive API returned %d: %s", resp.StatusCode, string(body))
			}()
			continue
		}
		return resp, nil
	}
	return nil, lastErr
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

	// Try cache first
	if reports, ok := h.cache.get(since); ok {
		return c.JSON(fiber.Map{"reports": reports, "source": "cache"})
	}

	// Compute cutoff time from since parameter
	var cutoff time.Time
	if d := parseSinceDuration(since); d > 0 {
		cutoff = time.Now().Add(-d)
	}

	// Fetch from Google Drive
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

	// If cache is fresh, send it all at once
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

	// Compute cutoff time from since parameter
	var cutoff time.Time
	if d := parseSinceDuration(since); d > 0 {
		cutoff = time.Now().Add(-d)
	}

	// Stream from Google Drive
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	// Capture the request context before entering the stream writer callback
	// so cancellation propagates from the HTTP request to all Drive API calls (#9732).
	reqCtx := c.UserContext()

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		// Create a cancellable context derived from the request context so all
		// goroutines and Drive API calls abort promptly when the client
		// disconnects (#9517, #9732).
		ctx, cancel := context.WithCancel(reqCtx)
		defer cancel()

		allReports := make([]BenchmarkReport, 0)
		totalSent := 0
		skippedFolders := 0
		totalParseFailures := 0

		// Accumulate reports into a pending batch and flush every batchSize reports.
		const batchSize = 8
		pendingBatch := make([]BenchmarkReport, 0)

		// safeFlush writes pending data and cancels the context on write error
		// (which signals that the client has disconnected).
		safeFlush := func() {
			if err := w.Flush(); err != nil {
				slog.Info("[benchmarks] client disconnected, cancelling stream", "error", err)
				cancel()
			}
		}

		flushBatch := func() {
			if len(pendingBatch) == 0 {
				return
			}
			if ctx.Err() != nil {
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

		// Send immediate progress event so the client knows we're connected
		fmt.Fprintf(w, "event: progress\ndata: {\"status\":\"connecting\",\"total\":0}\n\n")
		safeFlush()
		if ctx.Err() != nil {
			return
		}

		// streamMu protects shared state (allReports, pendingBatch, counters, w)
		// across concurrent goroutines, including the keepalive ticker.
		var streamMu sync.Mutex

		// Start keepalive ticker — send comment heartbeats every 5s
		keepaliveDone := make(chan struct{})
		go func() {
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
		}()
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

		// Filter to folders only, skip folders older than cutoff
		var experiments []driveFile
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
		// Separate semaphore for inner run goroutines to prevent deadlock when
		// all outer slots are held while inner goroutines wait for the same pool.
		innerSem := make(chan struct{}, driveFetchConcurrency)

		for _, item := range experiments {
			if ctx.Err() != nil {
				break
			}
			item := item // capture
			streamWg.Add(1)
			// Use select for semaphore acquisition so we can bail on cancellation.
			select {
			case streamSem <- struct{}{}:
			case <-ctx.Done():
				streamWg.Done()
				continue
			}
			go func() {
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
					runItem := runItem // capture
					innerWg.Add(1)
					select {
					case innerSem <- struct{}{}:
					case <-ctx.Done():
						innerWg.Done()
						continue
					}
					go func() {
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
					}()
				}
				innerWg.Wait()
			}()
		}
		streamWg.Wait()

		// Flush any final remaining reports
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

// fetchRunFolderStreaming delegates to fetchRunFolder and calls onReport for each
// parsed report, ensuring the streaming and non-streaming paths never diverge.
func (h *BenchmarkHandlers) fetchRunFolderStreaming(ctx context.Context, folderID, experimentName, runName string, onReport func(BenchmarkReport)) ([]BenchmarkReport, int, error) {
	reports, parseFailures, err := h.fetchRunFolder(ctx, folderID, experimentName, runName)
	if err != nil {
		return nil, parseFailures, err
	}
	for _, r := range reports {
		onReport(r)
	}
	return reports, parseFailures, nil
}

// fetchAllReports is the non-streaming version for the standard endpoint.
// cutoff filters out folders older than the given time; zero means no filter.
// Returns reports and a count of files that failed to download or parse.
//
// Experiment and run folders are processed concurrently (bounded by
// driveFetchConcurrency).  The per-request throttle() still serialises
// actual HTTP calls so the Drive API rate limit is respected.
func (h *BenchmarkHandlers) fetchAllReports(ctx context.Context, cutoff time.Time) ([]BenchmarkReport, int, error) {
	topLevel, err := h.listDriveFolder(ctx, h.folderID)
	if err != nil {
		return nil, 0, fmt.Errorf("listing top-level folder: %w", err)
	}

	// Filter experiments up-front so we know the work set.
	var experiments []driveFile
	for _, item := range topLevel {
		if item.MimeType != driveFolderMIME {
			continue
		}
		if !isAfterCutoff(item, cutoff) {
			continue
		}
		experiments = append(experiments, item)
	}

	var (
		mu             sync.Mutex
		allReports     []BenchmarkReport
		totalFailures  int
		wg             sync.WaitGroup
		sem            = make(chan struct{}, driveFetchConcurrency)
		innerSem       = make(chan struct{}, driveFetchConcurrency)
	)

	for _, item := range experiments {
		item := item // capture loop var
		wg.Add(1)
		sem <- struct{}{} // acquire semaphore slot
		go func() {
			defer wg.Done()
			defer func() { <-sem }() // release slot

			runFolders, listErr := h.listDriveFolder(ctx, item.ID)
			if listErr != nil {
				slog.Error("[benchmarks] error listing experiment", "experiment", item.Name, "error", listErr)
				return
			}

			// Process run folders within this experiment concurrently too.
			var innerWg sync.WaitGroup
			for _, runItem := range runFolders {
				if runItem.MimeType != driveFolderMIME {
					continue
				}
				if !isAfterCutoff(runItem, cutoff) {
					continue
				}
				runItem := runItem // capture
				innerWg.Add(1)
				innerSem <- struct{}{} // separate semaphore for inner work
				go func() {
					defer innerWg.Done()
					defer func() { <-innerSem }()

					reports, failures, runErr := h.fetchRunFolder(ctx, runItem.ID, item.Name, runItem.Name)
					if runErr != nil {
						slog.Error("[benchmarks] error in experiment run", "experiment", item.Name, "run", runItem.Name, "error", runErr)
						return
					}
					mu.Lock()
					allReports = append(allReports, reports...)
					totalFailures += failures
					mu.Unlock()
				}()
			}
			innerWg.Wait()
		}()
	}
	wg.Wait()

	return allReports, totalFailures, nil
}

// fetchRunFolder downloads benchmark YAML files from a run folder.
// Handles nested layouts: run → results → individual-result → benchmark_report*.yaml
// Returns reports and a count of files that failed to download or parse.
func (h *BenchmarkHandlers) fetchRunFolder(ctx context.Context, folderID, experimentName, runName string) ([]BenchmarkReport, int, error) {
	items, err := h.listDriveFolder(ctx, folderID)
	if err != nil {
		return nil, 0, err
	}

	// First: look for benchmark YAML files directly in this folder
	reports := make([]BenchmarkReport, 0)
	var subfolders []driveFile
	parseFailures := 0
	for _, f := range items {
		if f.MimeType == driveFolderMIME {
			subfolders = append(subfolders, f)
			continue
		}
		if strings.HasPrefix(f.Name, benchmarkFilePrefix) && strings.HasSuffix(f.Name, benchmarkFileSuffix) {
			report, err := h.downloadAndParseReport(ctx, f, experimentName, runName)
			if err != nil {
				parseFailures++
				continue
			}
			reports = append(reports, report)
		}
	}
	if len(reports) > 0 {
		return reports, parseFailures, nil
	}

	// No direct files — look for "results" subfolder containing individual result folders
	for _, sub := range subfolders {
		if !strings.EqualFold(sub.Name, "results") {
			continue
		}
		resultFolders, err := h.listDriveFolder(ctx, sub.ID)
		if err != nil {
			slog.Error("[benchmarks] error listing results", "experiment", experimentName, "run", runName, "error", err)
			continue
		}
		for _, rf := range resultFolders {
			if rf.MimeType != driveFolderMIME {
				continue
			}
			r, failures, err := h.collectBenchmarkFiles(ctx, rf.ID, experimentName, runName)
			if err != nil {
				continue
			}
			reports = append(reports, r...)
			parseFailures += failures
		}
	}
	return reports, parseFailures, nil
}

// collectBenchmarkFiles finds and parses benchmark YAML files in a single folder.
// Returns the parsed reports and a count of files that failed to parse.
func (h *BenchmarkHandlers) collectBenchmarkFiles(ctx context.Context, folderID, experimentName, runName string) ([]BenchmarkReport, int, error) {
	files, err := h.listDriveFolder(ctx, folderID)
	if err != nil {
		return nil, 0, err
	}
	reports := make([]BenchmarkReport, 0)
	parseFailures := 0
	for _, f := range files {
		if f.MimeType == driveFolderMIME {
			continue
		}
		if strings.HasPrefix(f.Name, benchmarkFilePrefix) && strings.HasSuffix(f.Name, benchmarkFileSuffix) {
			report, err := h.downloadAndParseReport(ctx, f, experimentName, runName)
			if err != nil {
				parseFailures++
				continue
			}
			reports = append(reports, report)
		}
	}
	return reports, parseFailures, nil
}

// downloadAndParseReport downloads a single benchmark YAML file and parses it.
func (h *BenchmarkHandlers) downloadAndParseReport(ctx context.Context, f driveFile, experimentName, runName string) (BenchmarkReport, error) {
	data, err := h.downloadDriveFile(ctx, f.ID)
	if err != nil {
		slog.Error("[benchmarks] error downloading file", "file", f.Name, "error", err)
		return BenchmarkReport{}, err
	}
	var raw rawV1Report
	if err := yaml.Unmarshal(data, &raw); err != nil {
		slog.Error("[benchmarks] error parsing file", "file", f.Name, "error", err)
		return BenchmarkReport{}, err
	}
	return adaptV1ToV2(raw, experimentName, runName, f.CreatedTime), nil
}

// listDriveFolder lists all files in a Google Drive folder, handling pagination
// so that folders with more than 1000 items are not silently truncated.
func (h *BenchmarkHandlers) listDriveFolder(ctx context.Context, folderID string) ([]driveFile, error) {
	var allFiles []driveFile
	pageToken := ""

	for {
		reqURL := fmt.Sprintf("%s?q='%s'+in+parents&key=%s&fields=files(id,name,mimeType,createdTime),nextPageToken&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true",
			driveAPIBase, folderID, h.apiKey)
		if pageToken != "" {
			reqURL += "&pageToken=" + pageToken
		}

		resp, err := h.driveGetWithRetry(ctx, reqURL)
		if err != nil {
			return nil, err
		}
		if resp == nil {
			return nil, fmt.Errorf("driveGetWithRetry returned nil response without error (should not happen)")
		}

		result, err := func() (*driveFileList, error) {
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				var bodyStr string
				if body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBenchmarkReportBytes)); readErr == nil {
					bodyStr = string(body)
				}
				return nil, fmt.Errorf("Drive API returned %d: %s", resp.StatusCode, bodyStr)
			}
			var result driveFileList
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				return nil, fmt.Errorf("decoding response: %w", err)
			}
			return &result, nil
		}()
		if err != nil {
			return nil, err
		}

		allFiles = append(allFiles, result.Files...)

		if result.NextPageToken == "" {
			break
		}
		pageToken = result.NextPageToken
	}

	return allFiles, nil
}

// downloadDriveFile downloads file content from Google Drive.
// Uses webContentLink (drive.google.com/uc?id=...&export=download) which is more
// resilient to Google's anti-bot protection than the API's alt=media endpoint.
func (h *BenchmarkHandlers) downloadDriveFile(ctx context.Context, fileID string) ([]byte, error) {
	downloadURL := fmt.Sprintf("https://drive.google.com/uc?id=%s&export=download", fileID)

	resp, err := h.driveGet(ctx, downloadURL)
	if err != nil {
		return nil, fmt.Errorf("HTTP error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		// #7963 — bound error-body reads too, so a non-200 status can't be
		// used to force the parent to buffer an unbounded body.
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBenchmarkReportBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		return nil, fmt.Errorf("Drive download returned %d: %s", resp.StatusCode, string(body))
	}

	// #7963 — cap the download at maxBenchmarkReportBytes. io.LimitReader
	// silently truncates, so pair with ReadAll and (below) explicitly check
	// whether we hit the cap so callers see a real error rather than a
	// partially-decoded report.
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBenchmarkReportBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBenchmarkReportBytes {
		return nil, fmt.Errorf("Drive download exceeded max size of %d bytes", maxBenchmarkReportBytes)
	}
	return data, nil
}

// ---------------------------------------------------------------------------
// v0.1 → v0.2 adapter
// ---------------------------------------------------------------------------

func adaptV1ToV2(raw rawV1Report, experimentName, runName, fileCreatedTime string) BenchmarkReport {
	var report BenchmarkReport
	report.Version = "0.2"

	// Run metadata — synthesize from what we have
	report.Run.UID = fmt.Sprintf("%s/%s/stage-%d", experimentName, runName, raw.Scenario.Load.Metadata.Stage)
	report.Run.EID = fmt.Sprintf("%s/%s", experimentName, runName)
	report.Run.User = "benchmark-ci"
	durationSec := raw.Metrics.Time.Duration
	report.Run.Time.Duration = fmt.Sprintf("PT%.0fS", durationSec)

	// Use real file creation time from Google Drive if available
	if created, ok := parseDriveTime(fileCreatedTime); ok {
		report.Run.Time.End = created.Format(time.RFC3339)
		report.Run.Time.Start = created.Add(-time.Duration(durationSec) * time.Second).Format(time.RFC3339)
	} else {
		report.Run.Time.Start = time.Now().Add(-time.Duration(durationSec) * time.Second).Format(time.RFC3339)
		report.Run.Time.End = time.Now().Format(time.RFC3339)
	}

	// Stack — build from host accelerator + model + engine info
	report.Scenario.Stack = buildStackComponents(raw)

	// Load config
	report.Scenario.Load = buildLoadConfig(raw)

	// Results — latency (already Statistics in v0.1)
	agg := &report.Results.RequestPerformance.Aggregate
	agg.Latency.TimeToFirstToken = convertStats(raw.Metrics.Latency.TimeToFirstToken)
	agg.Latency.TimePerOutputToken = convertStats(raw.Metrics.Latency.TimePerOutputToken)
	agg.Latency.InterTokenLatency = convertStats(raw.Metrics.Latency.InterTokenLatency)
	agg.Latency.NormalizedTimePerOutputToken = convertStats(raw.Metrics.Latency.NormalizedTimePerOutputToken)
	agg.Latency.RequestLatency = convertStats(raw.Metrics.Latency.RequestLatency)

	// Results — throughput (scalars in v0.1 → Statistics in v0.2)
	agg.Throughput.OutputTokenRate = scalarToStats(raw.Metrics.Throughput.OutputTokensPerSec, "tokens/s")
	agg.Throughput.RequestRate = scalarToStats(raw.Metrics.Throughput.RequestsPerSec, "requests/s")
	agg.Throughput.TotalTokenRate = scalarToStats(raw.Metrics.Throughput.TotalTokensPerSec, "tokens/s")
	// Input token rate not in v0.1 — derive from total - output
	inputRate := raw.Metrics.Throughput.TotalTokensPerSec - raw.Metrics.Throughput.OutputTokensPerSec
	if inputRate > 0 {
		agg.Throughput.InputTokenRate = scalarToStats(inputRate, "tokens/s")
	} else if inputRate < 0 {
		slog.Warn("[benchmarks] negative derived input_token_rate, skipping field",
			"inputRate", inputRate, "experiment", experimentName, "run", runName,
			"stage", raw.Scenario.Load.Metadata.Stage,
			"totalTokensPerSec", raw.Metrics.Throughput.TotalTokensPerSec,
			"outputTokensPerSec", raw.Metrics.Throughput.OutputTokensPerSec)
	}

	// Results — requests
	agg.Requests.Total = raw.Metrics.Requests.Total
	agg.Requests.Failures = raw.Metrics.Requests.Failures
	agg.Requests.InputLength = convertStats(raw.Metrics.Requests.InputLength)
	agg.Requests.OutputLength = convertStats(raw.Metrics.Requests.OutputLength)

	return report
}

func buildStackComponents(raw rawV1Report) []BenchmarkStackComponent {
	components := make([]BenchmarkStackComponent, 0)

	// Build one component per accelerator entry
	for i, accel := range raw.Scenario.Host.Accelerator {
		role := "decode"
		if i < len(raw.Scenario.Host.Type) {
			role = raw.Scenario.Host.Type[i]
		}

		engineName := ""
		if i < len(raw.Scenario.Platform.Engine) {
			engineName = raw.Scenario.Platform.Engine[i].Name
		}

		comp := BenchmarkStackComponent{}
		comp.Metadata.Label = fmt.Sprintf("%s-%d", role, i)
		comp.Metadata.CfgID = fmt.Sprintf("host-%d", i)
		comp.Standardized.Kind = "inference_engine"
		comp.Standardized.Tool = raw.Scenario.Load.Args.Server.Type
		comp.Standardized.ToolVersion = engineName
		comp.Standardized.Role = role
		comp.Standardized.Model = &BenchmarkModelRef{
			Name: raw.Scenario.Model.Name,
		}
		comp.Standardized.Accelerator = &BenchmarkAccelerator{
			Model: accel.Model,
			Count: accel.Count,
			Parallelism: &BenchmarkParallelism{
				DP: accel.Parallelism.DP,
				TP: accel.Parallelism.TP,
				PP: accel.Parallelism.PP,
				EP: accel.Parallelism.EP,
			},
		}
		components = append(components, comp)
	}

	return components
}

func buildLoadConfig(raw rawV1Report) BenchmarkLoadConfig {
	var lc BenchmarkLoadConfig
	lc.Metadata.CfgID = fmt.Sprintf("stage-%d", raw.Scenario.Load.Metadata.Stage)
	lc.Metadata.Description = fmt.Sprintf("Stage %d of benchmark run", raw.Scenario.Load.Metadata.Stage)
	lc.Standardized.Tool = raw.Scenario.Load.Name
	lc.Standardized.ToolVersion = "v0.1"
	lc.Standardized.Source = "random"

	sp := raw.Scenario.Load.Args.Data.SharedPrefix
	lc.Standardized.InputSeqLen = &BenchmarkDistribution{
		Distribution: "fixed",
		Value:        float64(sp.SystemPromptLen + sp.QuestionLen),
	}
	lc.Standardized.OutputSeqLen = &BenchmarkDistribution{
		Distribution: "fixed",
		Value:        float64(sp.OutputLen),
	}

	// Rate from stage metadata — Stage is a 1-based label, convert to 0-based index
	stageLabel := raw.Scenario.Load.Metadata.Stage
	stageIdx := stageLabel - 1
	stages := raw.Scenario.Load.Args.Load.Stages
	if stageIdx >= 0 && stageIdx < len(stages) {
		rate := stages[stageIdx].Rate
		lc.Standardized.RateQPS = &rate
	}

	return lc
}

// convertStats converts a v0.1 Statistics to v0.2 format (same shape, just remap).
func convertStats(raw *rawV1Statistics) *BenchmarkStatistics {
	if raw == nil {
		return nil
	}
	return &BenchmarkStatistics{
		Units: raw.Units,
		Mean:  raw.Mean,
		Min:   raw.Min,
		P0p1:  raw.P0p1,
		P1:    raw.P1,
		P5:    raw.P5,
		P10:   raw.P10,
		P25:   raw.P25,
		P50:   raw.P50,
		P75:   raw.P75,
		P90:   raw.P90,
		P95:   raw.P95,
		P99:   raw.P99,
		P99p9: raw.P99p9,
		Max:   raw.Max,
	}
}

// scalarToStats wraps a scalar value into a Statistics object.
func scalarToStats(value float64, units string) *BenchmarkStatistics {
	if value == 0 {
		return nil
	}
	return &BenchmarkStatistics{
		Units: units,
		Mean:  value,
		P50:   &value,
	}
}
