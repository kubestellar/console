package store

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// clampLimit
// ---------------------------------------------------------------------------

func TestClampLimit(t *testing.T) {
	tests := []struct {
		name  string
		input int
		want  int
	}{
		{"zero returns 1", 0, 1},
		{"negative returns 1", -5, 1},
		{"within range", 50, 50},
		{"at max", maxSQLLimit, maxSQLLimit},
		{"above max clamped", maxSQLLimit + 1, maxSQLLimit},
		{"one is valid", 1, 1},
		{"large overshoot clamped", 99999, maxSQLLimit},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clampLimit(tt.input)
			assert.Equal(t, tt.want, got)
		})
	}
}

// ---------------------------------------------------------------------------
// parseUUID / parseUUIDStrict
// ---------------------------------------------------------------------------

func TestParseUUID_ValidUUID(t *testing.T) {
	id := uuid.New()
	got := parseUUID(id.String(), "test_field")
	assert.Equal(t, id, got)
}

func TestParseUUID_InvalidReturnsNil(t *testing.T) {
	got := parseUUID("not-a-uuid", "test_field")
	assert.Equal(t, uuid.Nil, got)
}

func TestParseUUID_EmptyReturnsNil(t *testing.T) {
	got := parseUUID("", "test_field")
	assert.Equal(t, uuid.Nil, got)
}

func TestParseUUIDStrict_ValidUUID(t *testing.T) {
	id := uuid.New()
	got, err := parseUUIDStrict(id.String(), "test_field")
	require.NoError(t, err)
	assert.Equal(t, id, got)
}

func TestParseUUIDStrict_InvalidReturnsError(t *testing.T) {
	got, err := parseUUIDStrict("not-a-uuid", "test_field")
	assert.Error(t, err)
	assert.Equal(t, uuid.Nil, got)
	assert.Contains(t, err.Error(), "test_field")
}

func TestParseUUIDStrict_EmptyReturnsError(t *testing.T) {
	got, err := parseUUIDStrict("", "test_field")
	assert.Error(t, err)
	assert.Equal(t, uuid.Nil, got)
}

// ---------------------------------------------------------------------------
// scanSQLiteTimestamp / parseSQLiteTimestampString
// ---------------------------------------------------------------------------

func TestScanSQLiteTimestamp_TimeType(t *testing.T) {
	now := time.Now()
	got, err := scanSQLiteTimestamp(now)
	require.NoError(t, err)
	assert.Equal(t, now.UTC(), got)
}

func TestScanSQLiteTimestamp_StringRFC3339(t *testing.T) {
	ts := "2025-06-15T14:30:00Z"
	got, err := scanSQLiteTimestamp(ts)
	require.NoError(t, err)
	assert.Equal(t, time.Date(2025, 6, 15, 14, 30, 0, 0, time.UTC), got)
}

func TestScanSQLiteTimestamp_StringSpaceFormat(t *testing.T) {
	ts := "2025-06-15 14:30:00"
	got, err := scanSQLiteTimestamp(ts)
	require.NoError(t, err)
	assert.Equal(t, time.Date(2025, 6, 15, 14, 30, 0, 0, time.UTC), got)
}

func TestScanSQLiteTimestamp_StringTZFormat(t *testing.T) {
	ts := "2025-06-15T14:30:00Z"
	got, err := scanSQLiteTimestamp(ts)
	require.NoError(t, err)
	assert.Equal(t, time.Date(2025, 6, 15, 14, 30, 0, 0, time.UTC), got)
}

func TestScanSQLiteTimestamp_ByteSlice(t *testing.T) {
	ts := []byte("2025-06-15 14:30:00")
	got, err := scanSQLiteTimestamp(ts)
	require.NoError(t, err)
	assert.Equal(t, time.Date(2025, 6, 15, 14, 30, 0, 0, time.UTC), got)
}

func TestScanSQLiteTimestamp_UnsupportedType(t *testing.T) {
	_, err := scanSQLiteTimestamp(12345)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported timestamp type")
}

func TestParseSQLiteTimestampString_UnparseableFormat(t *testing.T) {
	_, err := parseSQLiteTimestampString("not-a-timestamp")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unparseable timestamp")
}

func TestParseSQLiteTimestampString_AllFormats(t *testing.T) {
	cases := []struct {
		name   string
		input  string
		expect time.Time
	}{
		{"RFC3339", "2025-01-02T03:04:05Z", time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)},
		{"space format", "2025-01-02 03:04:05", time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)},
		{"T format no offset", "2025-01-02T03:04:05Z", time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseSQLiteTimestampString(tc.input)
			require.NoError(t, err)
			assert.Equal(t, tc.expect, got)
		})
	}
}
