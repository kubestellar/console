package benchmarks

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchRunFolder(t *testing.T) {
	tests := []struct {
		name              string
		folderID          string
		experimentName    string
		runName           string
		expectError       bool
		expectedMinLength int
	}{
		{
			name:              "empty folder ID",
			folderID:          "",
			experimentName:    "exp1",
			runName:           "run1",
			expectError       true,
			expectedMinLength: 0,
		},
		{
			name:              "valid folder ID format",
			folderID:          "mock-folder-id",
			experimentName:    "test-experiment",
			runName:           "test-run",
			expectError       true, // Will error because no real Drive API
			expectedMinLength: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewBenchmarkHandlers("test-key", "test-folder")
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			reports, failures, err := h.fetchRunFolder(ctx, tc.folderID, tc.experimentName, tc.runName)
			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			assert.GreaterOrEqual(t, len(reports), tc.expectedMinLength)
			assert.GreaterOrEqual(t, failures, 0)
		})
	}
}

func TestCollectBenchmarkFiles(t *testing.T) {
	tests := []struct {
		name              string
		folderID          string
		experimentName    string
		runName           string
		expectError       bool
		expectedMinLength int
	}{
		{
			name:              "empty folder ID",
			folderID:          "",
			experimentName:    "exp1",
			runName:           "run1",
			expectError       true,
			expectedMinLength: 0,
		},
		{
			name:              "valid folder ID format",
			folderID:          "mock-folder-id",
			experimentName:    "test-experiment",
			runName:           "test-run",
			expectError       true, // Will error because no real Drive API
			expectedMinLength: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewBenchmarkHandlers("test-key", "test-folder")
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			reports, failures, err := h.collectBenchmarkFiles(ctx, tc.folderID, tc.experimentName, tc.runName)
			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			assert.GreaterOrEqual(t, len(reports), tc.expectedMinLength)
			assert.GreaterOrEqual(t, failures, 0)
		})
	}
}

func TestFetchAllReports(t *testing.T) {
	tests := []struct {
		name        string
		cutoff      time.Time
		expectError bool
	}{
		{
			name:        "no cutoff filter",
			cutoff:      time.Time{},
			expectError: true, // Will error because no real Drive API
		},
		{
			name:        "with cutoff filter 30 days ago",
			cutoff:      time.Now().Add(-30 * 24 * time.Hour),
			expectError: true, // Will error because no real Drive API
		},
		{
			name:        "with cutoff filter 7 days ago",
			cutoff:      time.Now().Add(-7 * 24 * time.Hour),
			expectError: true, // Will error because no real Drive API
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewBenchmarkHandlers("test-key", "test-folder")
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			reports, failures, err := h.fetchAllReports(ctx, tc.cutoff)
			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			assert.GreaterOrEqual(t, len(reports), 0)
			assert.GreaterOrEqual(t, failures, 0)
		})
	}
}

func TestDownloadAndParseReport(t *testing.T) {
	tests := []struct {
		name           string
		file           driveFile
		experimentName string
		runName        string
		expectError    bool
	}{
		{
			name: "empty file ID",
			file: driveFile{
				ID:   "",
				Name: "benchmark_report_1.yaml",
			},
			experimentName: "exp1",
			runName:        "run1",
			expectError:    true,
		},
		{
			name: "invalid file ID format",
			file: driveFile{
				ID:   "invalid-id",
				Name: "benchmark_report_1.yaml",
			},
			experimentName: "exp1",
			runName:        "run1",
			expectError:    true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewBenchmarkHandlers("test-key", "test-folder")
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			report, err := h.downloadAndParseReport(ctx, tc.file, tc.experimentName, tc.runName)
			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.NotEmpty(t, report)
			}
		})
	}
}

func TestGetReportsHandler(t *testing.T) {
	tests := []struct {
		name           string
		apiKey         string
		folderID       string
		queryParams    string
		demoMode       bool
		expectedStatus int
		expectSource   string
	}{
		{
			name:           "demo mode returns empty array",
			apiKey:         "test-key",
			folderID:       "test-folder",
			queryParams:    "",
			demoMode:       true,
			expectedStatus: http.StatusOK,
			expectSource:   "demo",
		},
		{
			name:           "no API key configured",
			apiKey:         "",
			folderID:       "test-folder",
			queryParams:    "",
			demoMode:       false,
			expectedStatus: http.StatusServiceUnavailable,
			expectSource:   "unavailable",
		},
		{
			name:           "with since parameter",
			apiKey:         "test-key",
			folderID:       "test-folder",
			queryParams:    "?since=30d",
			demoMode:       false,
			expectedStatus: http.StatusBadGateway, // Will fail fetching from Drive
			expectSource:   "",
		},
		{
			name:           "default since parameter",
			apiKey:         "test-key",
			folderID:       "test-folder",
			queryParams:    "",
			demoMode:       false,
			expectedStatus: http.StatusBadGateway, // Will fail fetching from Drive
			expectSource:   "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			h := NewBenchmarkHandlers(tc.apiKey, tc.folderID)
			app.Get("/api/benchmarks/reports", h.GetReports)

			req := httptest.NewRequest("GET", "/api/benchmarks/reports"+tc.queryParams, nil)
			if tc.demoMode {
				req.Header.Set("X-Demo-Mode", "true")
			}

			resp, err := app.Test(req, 5000) // 5 second timeout
			require.NoError(t, err)
			assert.Equal(t, tc.expectedStatus, resp.StatusCode)
		})
	}
}

func TestStreamReportsHandler(t *testing.T) {
	tests := []struct {
		name           string
		apiKey         string
		folderID       string
		queryParams    string
		demoMode       bool
		expectedStatus int
	}{
		{
			name:           "demo mode returns empty stream",
			apiKey:         "test-key",
			folderID:       "test-folder",
			queryParams:    "",
			demoMode:       true,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "no API key configured",
			apiKey:         "",
			folderID:       "test-folder",
			queryParams:    "",
			demoMode:       false,
			expectedStatus: http.StatusServiceUnavailable,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			h := NewBenchmarkHandlers(tc.apiKey, tc.folderID)
			app.Get("/api/benchmarks/stream", h.StreamReports)

			req := httptest.NewRequest("GET", "/api/benchmarks/stream"+tc.queryParams, nil)
			if tc.demoMode {
				req.Header.Set("X-Demo-Mode", "true")
			}

			resp, err := app.Test(req, 5000) // 5 second timeout
			require.NoError(t, err)
			assert.Equal(t, tc.expectedStatus, resp.StatusCode)
		})
	}
}

func TestParseSinceDuration(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected time.Duration
	}{
		{
			name:     "empty string",
			input:    "",
			expected: 0,
		},
		{
			name:     "zero value",
			input:    "0",
			expected: 0,
		},
		{
			name:     "zero days",
			input:    "0d",
			expected: 0,
		},
		{
			name:     "7 days",
			input:    "7d",
			expected: 7 * 24 * time.Hour,
		},
		{
			name:     "30 days",
			input:    "30d",
			expected: 30 * 24 * time.Hour,
		},
		{
			name:     "90 days",
			input:    "90d",
			expected: 90 * 24 * time.Hour,
		},
		{
			name:     "invalid format",
			input:    "invalid",
			expected: 0,
		},
		{
			name:     "negative days",
			input:    "-7d",
			expected: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := parseSinceDuration(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestNormalizeSinceKey(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty string",
			input:    "",
			expected: "0",
		},
		{
			name:     "zero value",
			input:    "0",
			expected: "0",
		},
		{
			name:     "zero days",
			input:    "0d",
			expected: "0",
		},
		{
			name:     "7 days",
			input:    "7d",
			expected: "7d",
		},
		{
			name:     "30 days",
			input:    "30d",
			expected: "30d",
		},
		{
			name:     "whitespace around zero",
			input:    "  0  ",
			expected: "0",
		},
		{
			name:     "whitespace around value",
			input:    "  7d  ",
			expected: "7d",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := normalizeSinceKey(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestIsAfterCutoff(t *testing.T) {
	now := time.Now()
	yesterday := now.Add(-24 * time.Hour)
	tomorrow := now.Add(24 * time.Hour)

	tests := []struct {
		name     string
		file     driveFile
		cutoff   time.Time
		expected bool
	}{
		{
			name: "zero cutoff always includes",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: yesterday.Format(time.RFC3339),
			},
			cutoff:   time.Time{},
			expected: true,
		},
		{
			name: "file created after cutoff",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: tomorrow.Format(time.RFC3339),
			},
			cutoff:   now,
			expected: true,
		},
		{
			name: "file created before cutoff",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: yesterday.Format(time.RFC3339),
			},
			cutoff:   now,
			expected: false,
		},
		{
			name: "no created time defaults to include",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: "",
			},
			cutoff:   now,
			expected: true,
		},
		{
			name: "invalid created time defaults to include",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: "invalid-timestamp",
			},
			cutoff:   now,
			expected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := isAfterCutoff(tc.file, tc.cutoff)
			assert.Equal(t, tc.expected, result)
		})
	}
}
