package store

import (
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// isSameUTCDay — date comparison for token usage daily reset
// ---------------------------------------------------------------------------

func TestIsSameUTCDay(t *testing.T) {
	tests := []struct {
		name string
		a, b time.Time
		same bool
	}{
		{
			"same instant",
			time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC),
			time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC),
			true,
		},
		{
			"same day different times",
			time.Date(2026, 6, 8, 0, 0, 0, 0, time.UTC),
			time.Date(2026, 6, 8, 23, 59, 59, 0, time.UTC),
			true,
		},
		{
			"different days",
			time.Date(2026, 6, 7, 23, 59, 59, 0, time.UTC),
			time.Date(2026, 6, 8, 0, 0, 0, 0, time.UTC),
			false,
		},
		{
			"different months",
			time.Date(2026, 5, 31, 12, 0, 0, 0, time.UTC),
			time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC),
			false,
		},
		{
			"different years",
			time.Date(2025, 12, 31, 12, 0, 0, 0, time.UTC),
			time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
			false,
		},
		{
			"different timezone same UTC day",
			time.Date(2026, 6, 8, 20, 0, 0, 0, time.FixedZone("EST", -5*3600)),
			time.Date(2026, 6, 9, 1, 0, 0, 0, time.UTC), // 2026-06-09 UTC
			false,
		},
		{
			"local time converts to same UTC day",
			time.Date(2026, 6, 8, 3, 0, 0, 0, time.FixedZone("UTC+5", 5*3600)),
			time.Date(2026, 6, 7, 22, 0, 0, 0, time.UTC),
			true, // both are 2026-06-07 UTC
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isSameUTCDay(tt.a, tt.b)
			if got != tt.same {
				t.Errorf("isSameUTCDay(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.same)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// normalizeCurrentDayTokenUsage — daily token usage reset logic
// ---------------------------------------------------------------------------

func TestNormalizeCurrentDayTokenUsage_Nil(t *testing.T) {
	now := time.Now()
	got := normalizeCurrentDayTokenUsage(nil, now)
	if got != nil {
		t.Error("expected nil for nil input")
	}
}

func TestNormalizeCurrentDayTokenUsage_SameDay(t *testing.T) {
	now := time.Date(2026, 6, 8, 14, 0, 0, 0, time.UTC)
	u := &UserTokenUsage{
		UserID:      "user-1",
		TotalTokens: 5000,
		TokensByCategory: map[string]int64{
			"chat": 3000,
			"code": 2000,
		},
		LastAgentSessionID: "session-abc",
		UpdatedAt:          time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC),
	}

	got := normalizeCurrentDayTokenUsage(u, now)
	// Same day — should return the same struct (not reset)
	if got.TotalTokens != 5000 {
		t.Errorf("TotalTokens = %d, want 5000 (same day, no reset)", got.TotalTokens)
	}
	if len(got.TokensByCategory) != 2 {
		t.Errorf("TokensByCategory should have 2 entries, got %d", len(got.TokensByCategory))
	}
}

func TestNormalizeCurrentDayTokenUsage_DifferentDay(t *testing.T) {
	now := time.Date(2026, 6, 9, 2, 0, 0, 0, time.UTC)
	u := &UserTokenUsage{
		UserID:      "user-1",
		TotalTokens: 5000,
		TokensByCategory: map[string]int64{
			"chat": 3000,
		},
		LastAgentSessionID: "session-abc",
		UpdatedAt:          time.Date(2026, 6, 8, 23, 0, 0, 0, time.UTC),
	}

	got := normalizeCurrentDayTokenUsage(u, now)
	// Different day — should reset categories but preserve UserID and session
	if got.UserID != "user-1" {
		t.Errorf("UserID = %q, want user-1", got.UserID)
	}
	if len(got.TokensByCategory) != 0 {
		t.Errorf("TokensByCategory should be empty after day change, got %d entries", len(got.TokensByCategory))
	}
	if got.LastAgentSessionID != "session-abc" {
		t.Errorf("LastAgentSessionID should be preserved, got %q", got.LastAgentSessionID)
	}
	if !got.UpdatedAt.Equal(now) {
		t.Errorf("UpdatedAt should be set to now, got %v", got.UpdatedAt)
	}
}

func TestNormalizeCurrentDayTokenUsage_ZeroUpdatedAt(t *testing.T) {
	now := time.Date(2026, 6, 8, 14, 0, 0, 0, time.UTC)
	u := &UserTokenUsage{
		UserID:      "user-1",
		TotalTokens: 100,
		TokensByCategory: map[string]int64{
			"chat": 100,
		},
	}

	got := normalizeCurrentDayTokenUsage(u, now)
	// Zero UpdatedAt → treated as same day (no reset)
	if got.TotalTokens != 100 {
		t.Errorf("TotalTokens = %d, want 100 (zero UpdatedAt = no reset)", got.TotalTokens)
	}
}

func TestNormalizeCurrentDayTokenUsage_NilCategories(t *testing.T) {
	now := time.Date(2026, 6, 8, 14, 0, 0, 0, time.UTC)
	u := &UserTokenUsage{
		UserID:           "user-1",
		TokensByCategory: nil,
		UpdatedAt:        now,
	}

	got := normalizeCurrentDayTokenUsage(u, now)
	if got.TokensByCategory == nil {
		t.Error("TokensByCategory should be initialized to empty map, not nil")
	}
}
