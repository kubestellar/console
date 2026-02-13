package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"gopkg.in/yaml.v3"
)

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
	Model       string                  `json:"model"`
	Count       int                     `json:"count"`
	Memory      *int                    `json:"memory,omitempty"`
	Parallelism *BenchmarkParallelism   `json:"parallelism,omitempty"`
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
		Tool       string                   `json:"tool"`
		ToolVersion string                  `json:"tool_version"`
		Source      string                  `json:"source"`
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
	TimeToFirstToken          *BenchmarkStatistics `json:"time_to_first_token,omitempty"`
	TimePerOutputToken        *BenchmarkStatistics `json:"time_per_output_token,omitempty"`
	InterTokenLatency         *BenchmarkStatistics `json:"inter_token_latency,omitempty"`
	NormalizedTimePerOutputToken *BenchmarkStatistics `json:"normalized_time_per_output_token,omitempty"`
	RequestLatency            *BenchmarkStatistics `json:"request_latency,omitempty"`
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
	Version  string `json:"version"`
	Run      struct {
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
				Latency    BenchmarkLatencyStats     `json:"latency"`
				Throughput BenchmarkThroughputStats  `json:"throughput"`
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
	Files []driveFile `json:"files"`
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
	if s == "" || s == "0" {
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
func (h *BenchmarkHandlers) throttle() {
	h.reqMu.Lock()
	defer h.reqMu.Unlock()
	elapsed := time.Since(h.lastReq)
	if elapsed < driveRequestDelay {
		time.Sleep(driveRequestDelay - elapsed)
	}
	h.lastReq = time.Now()
}

// driveGet performs a throttled HTTP GET with the proper User-Agent header.
func (h *BenchmarkHandlers) driveGet(url string) (*http.Response, error) {
	h.throttle()
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", driveUserAgent)
	return h.client.Do(req)
}

// driveGetWithRetry performs an HTTP GET with throttling and retry on 403 errors.
func (h *BenchmarkHandlers) driveGetWithRetry(url string) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt <= driveMaxRetries; attempt++ {
		if attempt > 0 {
			backoff := driveRetryBaseDelay * time.Duration(1<<(attempt-1))
			log.Printf("[benchmarks] Retrying after %v (attempt %d/%d)", backoff, attempt, driveMaxRetries)
			time.Sleep(backoff)
		}
		resp, err := h.driveGet(url)
		if err != nil {
			lastErr = fmt.Errorf("HTTP error: %w", err)
			continue
		}
		if resp.StatusCode == 403 || resp.StatusCode == 429 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			lastErr = fmt.Errorf("Drive API returned %d: %s", resp.StatusCode, string(body))
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

	since := c.Query("since", "0")

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
	reports, err := h.fetchAllReports(cutoff)
	if err != nil {
		log.Printf("[benchmarks] Google Drive fetch error: %v", err)
		h.cache.mu.RLock()
		stale := h.cache.reports
		h.cache.mu.RUnlock()
		if stale != nil {
			return c.JSON(fiber.Map{"reports": stale, "source": "stale-cache", "error": err.Error()})
		}
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("failed to fetch benchmark data: %v", err)})
	}

	h.cache.set(reports, since)
	log.Printf("[benchmarks] Fetched %d reports from Google Drive (since=%s)", len(reports), since)
	return c.JSON(fiber.Map{"reports": reports, "source": "live"})
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

	since := c.Query("since", "0")

	// If cache is fresh, send it all at once
	if reports, ok := h.cache.get(since); ok {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		batch, _ := json.Marshal(reports)
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

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		var allReports []BenchmarkReport
		totalSent := 0
		skippedFolders := 0

		// Accumulate reports into a pending batch and flush every batchSize reports.
		const batchSize = 8
		var pendingBatch []BenchmarkReport

		flushBatch := func() {
			if len(pendingBatch) == 0 {
				return
			}
			batch, _ := json.Marshal(pendingBatch)
			fmt.Fprintf(w, "event: batch\ndata: %s\n\n", batch)
			w.Flush()
			log.Printf("[benchmarks] Flushed batch of %d (total: %d)", len(pendingBatch), totalSent)
			pendingBatch = pendingBatch[:0]
		}

		// Send immediate progress event so the client knows we're connected
		fmt.Fprintf(w, "event: progress\ndata: {\"status\":\"connecting\",\"total\":0}\n\n")
		w.Flush()

		// Start keepalive ticker — send comment heartbeats every 5s
		keepaliveDone := make(chan struct{})
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					fmt.Fprintf(w, ": keepalive\n\n")
					w.Flush()
				case <-keepaliveDone:
					return
				}
			}
		}()
		defer close(keepaliveDone)

		topLevel, err := h.listDriveFolder(h.folderID)
		if err != nil {
			fmt.Fprintf(w, "event: error\ndata: {\"error\":%q}\n\n", err.Error())
			w.Flush()
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
			log.Printf("[benchmarks] Skipped %d experiment folders older than %s", skippedFolders, since)
		}
		fmt.Fprintf(w, "event: progress\ndata: {\"status\":\"fetching\",\"experiments\":%d,\"total\":0,\"skipped\":%d}\n\n", len(experiments), skippedFolders)
		w.Flush()

		for _, item := range experiments {
			runFolders, err := h.listDriveFolder(item.ID)
			if err != nil {
				log.Printf("[benchmarks] Error listing experiment %q: %v", item.Name, err)
				continue
			}
			for _, runItem := range runFolders {
				if runItem.MimeType != driveFolderMIME {
					continue
				}
				// Skip run folders older than cutoff
				if !isAfterCutoff(runItem, cutoff) {
					skippedFolders++
					continue
				}
				reports, err := h.fetchRunFolderStreaming(runItem.ID, item.Name, runItem.Name, func(report BenchmarkReport) {
					allReports = append(allReports, report)
					totalSent++
					pendingBatch = append(pendingBatch, report)
					if len(pendingBatch) >= batchSize {
						flushBatch()
					}
				})
				if err != nil {
					log.Printf("[benchmarks] Error in %q/%q: %v", item.Name, runItem.Name, err)
					continue
				}
				// Flush any remaining reports after each run folder for timely delivery
				if len(pendingBatch) > 0 {
					flushBatch()
				}
				if len(reports) > 0 {
					log.Printf("[benchmarks] Streamed %d from %q/%q (total: %d)", len(reports), item.Name, runItem.Name, totalSent)
				}
			}
		}

		// Flush any final remaining reports
		flushBatch()

		h.cache.set(allReports, since)
		log.Printf("[benchmarks] Stream complete: %d total reports, %d folders skipped (since=%s)", totalSent, skippedFolders, since)
		fmt.Fprintf(w, "event: done\ndata: {\"total\":%d,\"source\":\"live\"}\n\n", totalSent)
		w.Flush()
	})

	return nil
}

// fetchRunFolderStreaming is like fetchRunFolder but calls onReport for each individual report
// as it's parsed, enabling per-file SSE streaming.
func (h *BenchmarkHandlers) fetchRunFolderStreaming(folderID, experimentName, runName string, onReport func(BenchmarkReport)) ([]BenchmarkReport, error) {
	items, err := h.listDriveFolder(folderID)
	if err != nil {
		return nil, err
	}

	var reports []BenchmarkReport
	var subfolders []driveFile
	for _, f := range items {
		if f.MimeType == driveFolderMIME {
			subfolders = append(subfolders, f)
			continue
		}
		if strings.HasPrefix(f.Name, benchmarkFilePrefix) && strings.HasSuffix(f.Name, benchmarkFileSuffix) {
			report, err := h.downloadAndParseReport(f, experimentName, runName)
			if err != nil {
				continue
			}
			reports = append(reports, report)
			onReport(report)
		}
	}
	if len(reports) > 0 {
		return reports, nil
	}

	// No direct files — recurse into "results" subfolder
	for _, sub := range subfolders {
		if !strings.EqualFold(sub.Name, "results") {
			continue
		}
		resultFolders, err := h.listDriveFolder(sub.ID)
		if err != nil {
			continue
		}
		for _, rf := range resultFolders {
			if rf.MimeType != driveFolderMIME {
				continue
			}
			files, err := h.listDriveFolder(rf.ID)
			if err != nil {
				continue
			}
			for _, f := range files {
				if f.MimeType == driveFolderMIME {
					continue
				}
				if strings.HasPrefix(f.Name, benchmarkFilePrefix) && strings.HasSuffix(f.Name, benchmarkFileSuffix) {
					report, err := h.downloadAndParseReport(f, experimentName, runName)
					if err != nil {
						continue
					}
					reports = append(reports, report)
					onReport(report)
				}
			}
		}
	}
	return reports, nil
}

// fetchAllReports is the non-streaming version for the standard endpoint.
// cutoff filters out folders older than the given time; zero means no filter.
func (h *BenchmarkHandlers) fetchAllReports(cutoff time.Time) ([]BenchmarkReport, error) {
	topLevel, err := h.listDriveFolder(h.folderID)
	if err != nil {
		return nil, fmt.Errorf("listing top-level folder: %w", err)
	}

	var allReports []BenchmarkReport
	for _, item := range topLevel {
		if item.MimeType != driveFolderMIME {
			continue
		}
		if !isAfterCutoff(item, cutoff) {
			continue
		}
		runFolders, err := h.listDriveFolder(item.ID)
		if err != nil {
			log.Printf("[benchmarks] Error listing experiment %q: %v", item.Name, err)
			continue
		}
		for _, runItem := range runFolders {
			if runItem.MimeType != driveFolderMIME {
				continue
			}
			if !isAfterCutoff(runItem, cutoff) {
				continue
			}
			reports, err := h.fetchRunFolder(runItem.ID, item.Name, runItem.Name)
			if err != nil {
				log.Printf("[benchmarks] Error in %q/%q: %v", item.Name, runItem.Name, err)
				continue
			}
			allReports = append(allReports, reports...)
		}
	}
	return allReports, nil
}

// fetchRunFolder downloads benchmark YAML files from a run folder.
// Handles nested layouts: run → results → individual-result → benchmark_report*.yaml
func (h *BenchmarkHandlers) fetchRunFolder(folderID, experimentName, runName string) ([]BenchmarkReport, error) {
	items, err := h.listDriveFolder(folderID)
	if err != nil {
		return nil, err
	}

	// First: look for benchmark YAML files directly in this folder
	var reports []BenchmarkReport
	var subfolders []driveFile
	for _, f := range items {
		if f.MimeType == driveFolderMIME {
			subfolders = append(subfolders, f)
			continue
		}
		if strings.HasPrefix(f.Name, benchmarkFilePrefix) && strings.HasSuffix(f.Name, benchmarkFileSuffix) {
			report, err := h.downloadAndParseReport(f, experimentName, runName)
			if err != nil {
				continue
			}
			reports = append(reports, report)
		}
	}
	if len(reports) > 0 {
		return reports, nil
	}

	// No direct files — look for "results" subfolder containing individual result folders
	for _, sub := range subfolders {
		if !strings.EqualFold(sub.Name, "results") {
			continue
		}
		resultFolders, err := h.listDriveFolder(sub.ID)
		if err != nil {
			log.Printf("[benchmarks] Error listing results in %q/%q: %v", experimentName, runName, err)
			continue
		}
		for _, rf := range resultFolders {
			if rf.MimeType != driveFolderMIME {
				continue
			}
			r, err := h.collectBenchmarkFiles(rf.ID, experimentName, runName)
			if err != nil {
				continue
			}
			reports = append(reports, r...)
		}
	}
	return reports, nil
}

// collectBenchmarkFiles finds and parses benchmark YAML files in a single folder.
func (h *BenchmarkHandlers) collectBenchmarkFiles(folderID, experimentName, runName string) ([]BenchmarkReport, error) {
	files, err := h.listDriveFolder(folderID)
	if err != nil {
		return nil, err
	}
	var reports []BenchmarkReport
	for _, f := range files {
		if f.MimeType == driveFolderMIME {
			continue
		}
		if strings.HasPrefix(f.Name, benchmarkFilePrefix) && strings.HasSuffix(f.Name, benchmarkFileSuffix) {
			report, err := h.downloadAndParseReport(f, experimentName, runName)
			if err != nil {
				continue
			}
			reports = append(reports, report)
		}
	}
	return reports, nil
}

// downloadAndParseReport downloads a single benchmark YAML file and parses it.
func (h *BenchmarkHandlers) downloadAndParseReport(f driveFile, experimentName, runName string) (BenchmarkReport, error) {
	data, err := h.downloadDriveFile(f.ID)
	if err != nil {
		log.Printf("[benchmarks] Error downloading %q: %v", f.Name, err)
		return BenchmarkReport{}, err
	}
	var raw rawV1Report
	if err := yaml.Unmarshal(data, &raw); err != nil {
		log.Printf("[benchmarks] Error parsing %q: %v", f.Name, err)
		return BenchmarkReport{}, err
	}
	return adaptV1ToV2(raw, experimentName, runName, f.CreatedTime), nil
}

// listDriveFolder lists files in a Google Drive folder.
func (h *BenchmarkHandlers) listDriveFolder(folderID string) ([]driveFile, error) {
	url := fmt.Sprintf("%s?q='%s'+in+parents&key=%s&fields=files(id,name,mimeType,createdTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true",
		driveAPIBase, folderID, h.apiKey)

	resp, err := h.driveGetWithRetry(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Drive API returned %d: %s", resp.StatusCode, string(body))
	}

	var result driveFileList
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return result.Files, nil
}

// downloadDriveFile downloads file content from Google Drive.
// Uses webContentLink (drive.google.com/uc?id=...&export=download) which is more
// resilient to Google's anti-bot protection than the API's alt=media endpoint.
func (h *BenchmarkHandlers) downloadDriveFile(fileID string) ([]byte, error) {
	downloadURL := fmt.Sprintf("https://drive.google.com/uc?id=%s&export=download", fileID)

	resp, err := h.driveGet(downloadURL)
	if err != nil {
		return nil, fmt.Errorf("HTTP error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Drive download returned %d: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
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
	}

	// Results — requests
	agg.Requests.Total = raw.Metrics.Requests.Total
	agg.Requests.Failures = raw.Metrics.Requests.Failures
	agg.Requests.InputLength = convertStats(raw.Metrics.Requests.InputLength)
	agg.Requests.OutputLength = convertStats(raw.Metrics.Requests.OutputLength)

	return report
}

func buildStackComponents(raw rawV1Report) []BenchmarkStackComponent {
	var components []BenchmarkStackComponent

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

	// Rate from stage metadata
	stageIdx := raw.Scenario.Load.Metadata.Stage
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
