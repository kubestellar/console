package benchmarks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"

	"gopkg.in/yaml.v3"
)

// Google Drive API response types.
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
	h.lastReq = time.Now().Add(delay)
	h.reqMu.Unlock()

	select {
	case <-time.After(delay):
		return nil
	case <-ctx.Done():
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
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
		if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
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

// fetchRunFolderStreaming delegates to fetchRunFolder and calls onReport for each
// parsed report, ensuring the streaming and non-streaming paths never diverge.
func (h *BenchmarkHandlers) fetchRunFolderStreaming(ctx context.Context, folderID, experimentName, runName string, onReport func(BenchmarkReport)) ([]BenchmarkReport, int, error) {
	reports, parseFailures, err := h.fetchRunFolder(ctx, folderID, experimentName, runName)
	if err != nil {
		return nil, parseFailures, err
	}
	for _, report := range reports {
		onReport(report)
	}
	return reports, parseFailures, nil
}

// fetchAllReports is the non-streaming version for the standard endpoint.
// cutoff filters out folders older than the given time; zero means no filter.
// Returns reports and a count of files that failed to download or parse.
//
// Experiment and run folders are processed concurrently (bounded by
// driveFetchConcurrency). The per-request throttle() still serialises
// actual HTTP calls so the Drive API rate limit is respected.
func (h *BenchmarkHandlers) fetchAllReports(ctx context.Context, cutoff time.Time) ([]BenchmarkReport, int, error) {
	topLevel, err := h.listDriveFolder(ctx, h.folderID)
	if err != nil {
		return nil, 0, fmt.Errorf("listing top-level folder: %w", err)
	}

	experiments := make([]driveFile, 0, len(topLevel))
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
		mu            sync.Mutex
		allReports    = make([]BenchmarkReport, 0)
		totalFailures int
		wg            sync.WaitGroup
		experimentSem = make(chan struct{}, driveFetchConcurrency)
		runSem        = make(chan struct{}, driveFetchConcurrency)
	)

	for _, item := range experiments {
		item := item
		wg.Add(1)
		experimentSem <- struct{}{}
		safego.Go(func() {
			defer wg.Done()
			defer func() { <-experimentSem }()

			runFolders, listErr := h.listDriveFolder(ctx, item.ID)
			if listErr != nil {
				slog.Error("[benchmarks] error listing experiment", "experiment", item.Name, "error", listErr)
				return
			}

			var innerWg sync.WaitGroup
			for _, runItem := range runFolders {
				if runItem.MimeType != driveFolderMIME {
					continue
				}
				if !isAfterCutoff(runItem, cutoff) {
					continue
				}
				runItem := runItem
				innerWg.Add(1)
				runSem <- struct{}{}
				safego.Go(func() {
					defer innerWg.Done()
					defer func() { <-runSem }()

					reports, failures, runErr := h.fetchRunFolder(ctx, runItem.ID, item.Name, runItem.Name)
					if runErr != nil {
						slog.Error("[benchmarks] error in experiment run", "experiment", item.Name, "run", runItem.Name, "error", runErr)
						return
					}
					mu.Lock()
					allReports = append(allReports, reports...)
					totalFailures += failures
					mu.Unlock()
				})
			}
			innerWg.Wait()
		})
	}
	wg.Wait()

	return allReports, totalFailures, nil
}

// fetchRunFolder downloads benchmark YAML files from a run folder.
// Handles nested layouts: run → results → individual-result → benchmark_report*.yaml.
// Returns reports and a count of files that failed to download or parse.
func (h *BenchmarkHandlers) fetchRunFolder(ctx context.Context, folderID, experimentName, runName string) ([]BenchmarkReport, int, error) {
	items, err := h.listDriveFolder(ctx, folderID)
	if err != nil {
		return nil, 0, err
	}

	reports := make([]BenchmarkReport, 0, len(items))
	subfolders := make([]driveFile, 0, len(items)/2)
	parseFailures := 0
	for _, file := range items {
		if file.MimeType == driveFolderMIME {
			subfolders = append(subfolders, file)
			continue
		}
		if strings.HasPrefix(file.Name, benchmarkFilePrefix) && strings.HasSuffix(file.Name, benchmarkFileSuffix) {
			report, err := h.downloadAndParseReport(ctx, file, experimentName, runName)
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

	for _, subfolder := range subfolders {
		if !strings.EqualFold(subfolder.Name, "results") {
			continue
		}
		resultFolders, err := h.listDriveFolder(ctx, subfolder.ID)
		if err != nil {
			slog.Error("[benchmarks] error listing results", "experiment", experimentName, "run", runName, "error", err)
			continue
		}
		for _, resultFolder := range resultFolders {
			if resultFolder.MimeType != driveFolderMIME {
				continue
			}
			resultReports, failures, collectErr := h.collectBenchmarkFiles(ctx, resultFolder.ID, experimentName, runName)
			if collectErr != nil {
				continue
			}
			reports = append(reports, resultReports...)
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

	reports := make([]BenchmarkReport, 0, len(files))
	parseFailures := 0
	for _, file := range files {
		if file.MimeType == driveFolderMIME {
			continue
		}
		if strings.HasPrefix(file.Name, benchmarkFilePrefix) && strings.HasSuffix(file.Name, benchmarkFileSuffix) {
			report, err := h.downloadAndParseReport(ctx, file, experimentName, runName)
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
func (h *BenchmarkHandlers) downloadAndParseReport(ctx context.Context, file driveFile, experimentName, runName string) (BenchmarkReport, error) {
	data, err := h.downloadDriveFile(ctx, file.ID)
	if err != nil {
		slog.Error("[benchmarks] error downloading file", "file", file.Name, "error", err)
		return BenchmarkReport{}, err
	}

	var raw rawV1Report
	if err := yaml.Unmarshal(data, &raw); err != nil {
		slog.Error("[benchmarks] error parsing file", "file", file.Name, "error", err)
		return BenchmarkReport{}, err
	}
	return adaptV1ToV2(raw, experimentName, runName, file.CreatedTime), nil
}

// listDriveFolder lists all files in a Google Drive folder, handling pagination
// so that folders with more than 1000 items are not silently truncated.
func (h *BenchmarkHandlers) listDriveFolder(ctx context.Context, folderID string) ([]driveFile, error) {
	allFiles := make([]driveFile, 0)
	pageToken := ""

	for {
		reqURL := fmt.Sprintf("%s?q='%s'+in+parents&key=%s&fields=files(id,name,mimeType,createdTime),nextPageToken&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true", driveAPIBase, folderID, h.apiKey)
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
			if resp.StatusCode != http.StatusOK {
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

	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBenchmarkReportBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		return nil, fmt.Errorf("Drive download returned %d: %s", resp.StatusCode, string(body))
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBenchmarkReportBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBenchmarkReportBytes {
		return nil, fmt.Errorf("Drive download exceeded max size of %d bytes", maxBenchmarkReportBytes)
	}
	return data, nil
}
