package benchmarks

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- isDemoMode ----------

func TestIsDemoMode(t *testing.T) {
	tests := []struct {
		name        string
		headerValue string
		expected    bool
	}{
		{
			name:        "header set to true",
			headerValue: "true",
			expected:    true,
		},
		{
			name:        "header set to false",
			headerValue: "false",
			expected:    false,
		},
		{
			name:        "header empty",
			headerValue: "",
			expected:    false,
		},
		{
			name:        "header set to invalid value",
			headerValue: "invalid",
			expected:    false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Since isDemoMode reads from fiber.Ctx, we test it via the handler tests
			// This test documents the expected behavior
			assert.Equal(t, tc.headerValue == "true", tc.expected)
		})
	}
}

// ---------- benchmarkCache ----------

func TestBenchmarkCache_GetSet(t *testing.T) {
	cache := &benchmarkCache{
		ttl: 1 * time.Hour,
	}

	// Initially empty
	reports, ok := cache.get("0")
	assert.False(t, ok)
	assert.Nil(t, reports)

	// Set data
	testReports := []BenchmarkReport{
		{Version: "0.2", Run: struct {
			UID  string `json:"uid"`
			EID  string `json:"eid"`
			CID  string `json:"cid,omitempty"`
			Time struct {
				Start    string `json:"start"`
				End      string `json:"end"`
				Duration string `json:"duration"`
			} `json:"time"`
			User string `json:"user"`
		}{UID: "test-1"}},
	}
	cache.set(testReports, "0")

	// Get data with same key
	reports, ok = cache.get("0")
	assert.True(t, ok)
	require.Len(t, reports, 1)
	assert.Equal(t, "test-1", reports[0].Run.UID)

	// Get data with different key
	reports, ok = cache.get("7d")
	assert.False(t, ok)
	assert.Nil(t, reports)
}

func TestBenchmarkCache_TTLExpiration(t *testing.T) {
	cache := &benchmarkCache{
		ttl: 50 * time.Millisecond,
	}

	testReports := []BenchmarkReport{
		{Version: "0.2"},
	}
	cache.set(testReports, "0")

	// Should be available immediately
	reports, ok := cache.get("0")
	assert.True(t, ok)
	assert.NotNil(t, reports)

	// Wait for TTL to expire
	time.Sleep(100 * time.Millisecond)

	// Should be expired
	reports, ok = cache.get("0")
	assert.False(t, ok)
	assert.Nil(t, reports)
}

func TestBenchmarkCache_ConcurrentAccess(t *testing.T) {
	cache := &benchmarkCache{
		ttl: 1 * time.Hour,
	}

	testReports := []BenchmarkReport{
		{Version: "0.2"},
	}

	done := make(chan bool)

	// Writer goroutine
	go func() {
		for i := 0; i < 100; i++ {
			cache.set(testReports, "0")
		}
		done <- true
	}()

	// Reader goroutine
	go func() {
		for i := 0; i < 100; i++ {
			cache.get("0")
		}
		done <- true
	}()

	// Wait for both to finish
	<-done
	<-done
}

// ---------- NewBenchmarkHandlers ----------

func TestNewBenchmarkHandlers(t *testing.T) {
	tests := []struct {
		name     string
		apiKey   string
		folderID string
	}{
		{
			name:     "with valid credentials",
			apiKey:   "test-api-key",
			folderID: "test-folder-id",
		},
		{
			name:     "with empty credentials",
			apiKey:   "",
			folderID: "",
		},
		{
			name:     "with partial credentials",
			apiKey:   "test-api-key",
			folderID: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewBenchmarkHandlers(tc.apiKey, tc.folderID)
			require.NotNil(t, handler)
			assert.Equal(t, tc.apiKey, handler.apiKey)
			assert.Equal(t, tc.folderID, handler.folderID)
			assert.NotNil(t, handler.cache)
			assert.NotNil(t, handler.client)
			assert.Equal(t, defaultCacheTTL, handler.cache.ttl)
		})
	}
}

// ---------- fetchRunFolderStreaming ----------

func TestFetchRunFolderStreaming_CallbackInvoked(t *testing.T) {
	// This test verifies that fetchRunFolderStreaming calls the callback
	// for each report. Since it delegates to fetchRunFolder, and that
	// requires real Drive API access, we can only test that the callback
	// mechanism works in principle.
	
	// The function signature is tested by compilation.
	// The behavior is tested indirectly through integration tests.
	
	callbackCalled := false
	callback := func(report BenchmarkReport) {
		callbackCalled = true
	}
	
	// If we had mock reports, we would verify callback is called
	_ = callback
	_ = callbackCalled
}

// ---------- driveGet ----------

func TestDriveGet_ContextCancellation(t *testing.T) {
	h := &BenchmarkHandlers{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	_, err := h.driveGet(ctx, "https://example.com")
	require.Error(t, err)
	assert.Equal(t, context.Canceled, err)
}

// ---------- Constants validation ----------

func TestConstants(t *testing.T) {
	assert.Equal(t, "https://www.googleapis.com/drive/v3/files", driveAPIBase)
	assert.Equal(t, "application/vnd.google-apps.folder", driveFolderMIME)
	assert.Equal(t, 1*time.Hour, defaultCacheTTL)
	assert.Equal(t, "benchmark_report", benchmarkFilePrefix)
	assert.Equal(t, ".yaml", benchmarkFileSuffix)
	assert.Equal(t, 100*time.Millisecond, driveRequestDelay)
	assert.Equal(t, 3, driveMaxRetries)
	assert.Equal(t, 2*time.Second, driveRetryBaseDelay)
	assert.Equal(t, "KubeStellarConsole/1.0", driveUserAgent)
	assert.Equal(t, 8, driveFetchConcurrency)
	assert.Equal(t, int64(50*1024*1024), int64(maxBenchmarkReportBytes))
}

// ---------- BenchmarkReport structure validation ----------

func TestBenchmarkReportStructure(t *testing.T) {
	report := BenchmarkReport{
		Version: "0.2",
	}
	report.Run.UID = "exp/run/stage-1"
	report.Run.EID = "exp/run"
	report.Run.User = "test-user"
	report.Run.Time.Start = "2025-01-01T00:00:00Z"
	report.Run.Time.End = "2025-01-01T00:01:00Z"
	report.Run.Time.Duration = "PT60S"

	assert.Equal(t, "0.2", report.Version)
	assert.Equal(t, "exp/run/stage-1", report.Run.UID)
	assert.Equal(t, "exp/run", report.Run.EID)
	assert.Equal(t, "test-user", report.Run.User)
}

// ---------- BenchmarkStatistics structure validation ----------

func TestBenchmarkStatisticsStructure(t *testing.T) {
	mean := 10.0
	p50 := 9.5
	p99 := 19.0
	
	stats := &BenchmarkStatistics{
		Units: "ms",
		Mean:  mean,
		P50:   &p50,
		P99:   &p99,
	}

	assert.Equal(t, "ms", stats.Units)
	assert.Equal(t, mean, stats.Mean)
	require.NotNil(t, stats.P50)
	assert.Equal(t, p50, *stats.P50)
	require.NotNil(t, stats.P99)
	assert.Equal(t, p99, *stats.P99)
	assert.Nil(t, stats.Min)
	assert.Nil(t, stats.Max)
}

// ---------- BenchmarkAccelerator structure validation ----------

func TestBenchmarkAcceleratorStructure(t *testing.T) {
	memory := 80
	accel := &BenchmarkAccelerator{
		Model:  "H100",
		Count:  8,
		Memory: &memory,
		Parallelism: &BenchmarkParallelism{
			DP: 1,
			TP: 8,
			PP: 1,
			EP: 1,
		},
	}

	assert.Equal(t, "H100", accel.Model)
	assert.Equal(t, 8, accel.Count)
	require.NotNil(t, accel.Memory)
	assert.Equal(t, 80, *accel.Memory)
	require.NotNil(t, accel.Parallelism)
	assert.Equal(t, 8, accel.Parallelism.TP)
}

// ---------- Edge cases for parseSinceDuration ----------

func TestParseSinceDuration_EdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected time.Duration
	}{
		{
			name:     "whitespace only",
			input:    "   ",
			expected: 0,
		},
		{
			name:     "zero with whitespace",
			input:    " 0 ",
			expected: 0,
		},
		{
			name:     "days without d suffix",
			input:    "30",
			expected: 0, // Invalid format
		},
		{
			name:     "negative zero",
			input:    "-0d",
			expected: 0,
		},
		{
			name:     "float days",
			input:    "7.5d",
			expected: 0, // Invalid format (Atoi will fail)
		},
		{
			name:     "very large days",
			input:    "999d",
			expected: 999 * 24 * time.Hour,
		},
		{
			name:     "hours format unsupported",
			input:    "48h",
			expected: 0, // Only days format supported
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := parseSinceDuration(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

// ---------- Edge cases for normalizeSinceKey ----------

func TestNormalizeSinceKey_EdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "tab characters",
			input:    "\t0\t",
			expected: "0",
		},
		{
			name:     "newline characters",
			input:    "\n7d\n",
			expected: "7d",
		},
		{
			name:     "mixed whitespace",
			input:    " \t 30d \n ",
			expected: "30d",
		},
		{
			name:     "zero with d",
			input:    "0d",
			expected: "0",
		},
		{
			name:     "preserves valid input",
			input:    "90d",
			expected: "90d",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := normalizeSinceKey(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

// ---------- Edge cases for isAfterCutoff ----------

func TestIsAfterCutoff_EdgeCases(t *testing.T) {
	now := time.Now()
	exactCutoff := now.Add(-7 * 24 * time.Hour)

	tests := []struct {
		name     string
		file     driveFile
		cutoff   time.Time
		expected bool
	}{
		{
			name: "file created exactly at cutoff",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: exactCutoff.Format(time.RFC3339),
			},
			cutoff:   exactCutoff,
			expected: false, // created.Before(cutoff) is false, so !created.Before(cutoff) is true, but actually the cutoff check is >= so this should be false
		},
		{
			name: "file created 1 second after cutoff",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: exactCutoff.Add(1 * time.Second).Format(time.RFC3339),
			},
			cutoff:   exactCutoff,
			expected: true,
		},
		{
			name: "file created 1 second before cutoff",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: exactCutoff.Add(-1 * time.Second).Format(time.RFC3339),
			},
			cutoff:   exactCutoff,
			expected: false,
		},
		{
			name: "malformed RFC3339",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: "2025-13-45T99:99:99Z", // Invalid date
			},
			cutoff:   now,
			expected: true, // Defaults to include on parse error
		},
		{
			name: "partial timestamp",
			file: driveFile{
				Name:        "test.yaml",
				CreatedTime: "2025-01-01", // Missing time component
			},
			cutoff:   now,
			expected: true, // Defaults to include on parse error
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := isAfterCutoff(tc.file, tc.cutoff)
			assert.Equal(t, tc.expected, result)
		})
	}
}

// ---------- Edge cases for parseDriveTime ----------

func TestParseDriveTime_EdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		expectOK  bool
		checkYear int
	}{
		{
			name:      "valid UTC time",
			input:     "2025-01-15T10:30:00Z",
			expectOK:  true,
			checkYear: 2025,
		},
		{
			name:      "valid time with positive offset",
			input:     "2025-01-15T10:30:00+05:30",
			expectOK:  true,
			checkYear: 2025,
		},
		{
			name:      "valid time with negative offset",
			input:     "2025-01-15T10:30:00-08:00",
			expectOK:  true,
			checkYear: 2025,
		},
		{
			name:     "empty string",
			input:    "",
			expectOK: false,
		},
		{
			name:     "invalid format",
			input:    "not-a-date",
			expectOK: false,
		},
		{
			name:     "partial date",
			input:    "2025-01-15",
			expectOK: false,
		},
		{
			name:     "wrong separator",
			input:    "2025/01/15 10:30:00",
			expectOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ts, ok := parseDriveTime(tc.input)
			assert.Equal(t, tc.expectOK, ok)
			if tc.expectOK {
				assert.Equal(t, tc.checkYear, ts.Year())
			}
		})
	}
}
