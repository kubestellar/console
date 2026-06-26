package store

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSQLiteStellarMemoryListEntries(t *testing.T) {
	store := OpenTestDB(t)
	baseTime := time.Date(2025, time.January, 2, 3, 4, 5, 0, time.UTC)

	entries := []StellarMemoryEntry{
		{UserID: "user-1", Cluster: "prod-a", Category: "incident", Summary: "first", CreatedAt: baseTime.Add(time.Minute), Tags: []string{"alerts"}},
		{UserID: "user-1", Cluster: "prod-b", Category: "incident", Summary: "second", CreatedAt: baseTime.Add(2 * time.Minute), Tags: []string{"alerts"}},
		{UserID: "user-1", Cluster: "prod-a", Category: "recovery", Summary: "third", CreatedAt: baseTime.Add(3 * time.Minute), Tags: []string{"runbook"}},
		{UserID: "other-user", Cluster: "prod-a", Category: "incident", Summary: "foreign", CreatedAt: baseTime.Add(4 * time.Minute), Tags: []string{"skip"}},
	}
	for i := range entries {
		createMemoryEntryForTest(t, store, &entries[i])
	}

	tests := []struct {
		name     string
		cluster  string
		category string
		limit    int
		offset   int
		wantIDs  []string
	}{
		{name: "empty results", cluster: "missing", limit: 10},
		{name: "all user entries newest first", limit: 10, wantIDs: []string{entries[2].ID, entries[1].ID, entries[0].ID}},
		{name: "cluster filter", cluster: "prod-a", limit: 10, wantIDs: []string{entries[2].ID, entries[0].ID}},
		{name: "category filter", category: "incident", limit: 10, wantIDs: []string{entries[1].ID, entries[0].ID}},
		{name: "pagination clamps negative offset", limit: 2, offset: -5, wantIDs: []string{entries[2].ID, entries[1].ID}},
		{name: "pagination uses offset", limit: 2, offset: 1, wantIDs: []string{entries[1].ID, entries[0].ID}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := store.ListStellarMemoryEntries(ctx, "user-1", tc.cluster, tc.category, tc.limit, tc.offset)
			require.NoError(t, err)
			requireMemoryIDs(t, got, tc.wantIDs)
		})
	}
}

func TestSQLiteStellarMemorySearch(t *testing.T) {
	store := OpenTestDB(t)
	baseTime := time.Date(2025, time.February, 3, 4, 5, 6, 0, time.UTC)

	recentLow := createMemoryEntryForTest(t, store, &StellarMemoryEntry{
		UserID:     "user-1",
		Cluster:    "prod-a",
		Category:   "incident",
		Summary:    "cache miss on api",
		RawContent: "response path",
		CreatedAt:  baseTime.Add(time.Minute),
		Tags:       []string{"cache"},
	})
	setMemoryImportanceForTest(t, store, recentLow.ID, 1)

	recentHigh := createMemoryEntryForTest(t, store, &StellarMemoryEntry{
		UserID:     "user-1",
		Cluster:    "prod-a",
		Category:   "incident",
		Summary:    "OOMKilled worker pod",
		RawContent: "container restarted after memory pressure",
		CreatedAt:  baseTime.Add(2 * time.Minute),
		Tags:       []string{"ops", "memory"},
	})
	setMemoryImportanceForTest(t, store, recentHigh.ID, 9)

	ftsSummary := createMemoryEntryForTest(t, store, &StellarMemoryEntry{
		UserID:     "user-1",
		Cluster:    "prod-a",
		Category:   "incident",
		Summary:    "CrashLoopBackOff on payments",
		RawContent: "probe failed repeatedly",
		CreatedAt:  baseTime.Add(3 * time.Minute),
		Tags:       []string{"kube"},
	})
	setMemoryImportanceForTest(t, store, ftsSummary.ID, 5)

	ftsRaw := createMemoryEntryForTest(t, store, &StellarMemoryEntry{
		UserID:     "user-1",
		Cluster:    "prod-b",
		Category:   "incident",
		Summary:    "worker incident",
		RawContent: "unique-needle showed up in detailed logs",
		CreatedAt:  baseTime.Add(4 * time.Minute),
		Tags:       []string{"logs"},
	})
	setMemoryImportanceForTest(t, store, ftsRaw.ID, 4)

	likeTag := createMemoryEntryForTest(t, store, &StellarMemoryEntry{
		UserID:     "user-1",
		Cluster:    "prod-c",
		Category:   "incident",
		Summary:    "network hiccup",
		RawContent: "short query fallback",
		CreatedAt:  baseTime.Add(5 * time.Minute),
		Tags:       []string{"x"},
	})
	setMemoryImportanceForTest(t, store, likeTag.ID, 3)

	createMemoryEntryForTest(t, store, &StellarMemoryEntry{
		UserID:     "other-user",
		Cluster:    "prod-a",
		Category:   "incident",
		Summary:    "CrashLoopBackOff hidden",
		RawContent: "should not leak across users",
		CreatedAt:  baseTime.Add(6 * time.Minute),
		Tags:       []string{"secret"},
	})

	for i := 0; i < 110; i++ {
		entry := createMemoryEntryForTest(t, store, &StellarMemoryEntry{
			UserID:     "bulk-user",
			Cluster:    "prod-bulk",
			Category:   "incident",
			Summary:    fmt.Sprintf("cache hit %03d", i),
			RawContent: "bulk record",
			CreatedAt:  baseTime.Add(time.Duration(100+i) * time.Minute),
			Tags:       []string{"cache"},
		})
		setMemoryImportanceForTest(t, store, entry.ID, 5)
	}

	tests := []struct {
		name    string
		userID  string
		query   string
		limit   int
		wantIDs []string
		wantLen int
	}{
		{name: "empty query falls back to recent memory ordering", userID: "user-1", query: "   ", limit: 3, wantIDs: []string{recentHigh.ID, ftsSummary.ID, ftsRaw.ID}},
		{name: "fts matches summary", userID: "user-1", query: "CrashLoopBackOff", limit: 10, wantIDs: []string{ftsSummary.ID}},
		{name: "fts matches raw content", userID: "user-1", query: "unique-needle", limit: 10, wantIDs: []string{ftsRaw.ID}},
		{name: "short query uses like fallback and matches tags", userID: "user-1", query: "x", limit: 10, wantIDs: []string{likeTag.ID}},
		{name: "missing query returns empty", userID: "user-1", query: "does-not-exist", limit: 10},
		{name: "search limit capped at one hundred", userID: "bulk-user", query: "cache", limit: 200, wantLen: 100},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := store.SearchStellarMemoryEntries(ctx, tc.userID, tc.query, tc.limit)
			require.NoError(t, err)
			if tc.wantIDs != nil {
				requireMemoryIDs(t, got, tc.wantIDs)
				return
			}
			require.Len(t, got, tc.wantLen)
		})
	}

	recent, err := store.GetRecentMemoryEntries(ctx, "user-1", "prod-a", 10)
	require.NoError(t, err)
	requireMemoryIDs(t, recent, []string{recentHigh.ID, ftsSummary.ID, recentLow.ID})
}

func TestSQLiteStellarMemoryErrors(t *testing.T) {
	t.Run("invalid tags payload fails scans", func(t *testing.T) {
		store := OpenTestDB(t)
		_, err := store.db.ExecContext(ctx, `INSERT INTO stellar_memory_entries (id, user_id, cluster, namespace, category, summary, raw_content, tags, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, "bad-tags", "user-1", "prod-a", "", "incident", "broken", "payload", "not-json", time.Now().UTC())
		require.NoError(t, err)

		_, err = store.ListStellarMemoryEntries(ctx, "user-1", "", "", 10, 0)
		require.Error(t, err)
	})

	t.Run("closed db returns query error", func(t *testing.T) {
		store := OpenTestDB(t)
		require.NoError(t, store.Close())

		_, err := store.SearchStellarMemoryEntries(ctx, "user-1", "cache", 10)
		require.Error(t, err)
	})
}

func createMemoryEntryForTest(t *testing.T, store *SQLiteStore, entry *StellarMemoryEntry) *StellarMemoryEntry {
	t.Helper()
	require.NoError(t, store.CreateStellarMemoryEntry(ctx, entry))
	require.NotEmpty(t, entry.ID)
	return entry
}

func setMemoryImportanceForTest(t *testing.T, store *SQLiteStore, id string, importance int) {
	t.Helper()
	_, err := store.db.ExecContext(ctx, `UPDATE stellar_memory_entries SET importance = ? WHERE id = ?`, importance, id)
	require.NoError(t, err)
}

func requireMemoryIDs(t *testing.T, got []StellarMemoryEntry, want []string) {
	t.Helper()
	require.Len(t, got, len(want))
	for i, id := range want {
		require.Equal(t, id, got[i].ID)
	}
}
