package store

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestScanStellarMissionRow_NullToolBindingsAndRunTimestamps exercises the
// previously-uncovered arms of scanStellarMissionRow:
//
//   - json.Unmarshal returning a nil slice for the literal JSON "null" value,
//     which then triggers the ToolBindings-nil-normalization arm.
//   - lastRunAt.Valid true → LastRunAt pointer set on returned struct.
//   - nextRunAt.Valid true → NextRunAt pointer set on returned struct.
//
// We insert a mission row directly so we can control tool_bindings/*_at
// column values without going through CreateStellarMission (which serializes
// tool bindings to a non-null JSON array and leaves *_at NULL).
func TestScanStellarMissionRow_NullToolBindingsAndRunTimestamps(t *testing.T) {
	s := newTestStore(t)
	const userID = "scan-user"

	missionID := uuid.NewString()
	lastRun := time.Now().UTC().Add(-1 * time.Hour).Truncate(time.Second)
	nextRun := time.Now().UTC().Add(1 * time.Hour).Truncate(time.Second)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stellar_missions
			(id, user_id, name, goal, schedule, trigger_type, provider_policy,
			 memory_scope, enabled, tool_bindings, last_run_at, next_run_at,
			 created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		missionID, userID, "null-bindings", "goal", "0 * * * *", "cron",
		"hybrid", "mission", 1, "null", lastRun, nextRun,
	)
	require.NoError(t, err)

	got, err := s.GetStellarMission(ctx, userID, missionID)
	require.NoError(t, err)
	require.NotNil(t, got)
	// ToolBindings should have been normalized from Unmarshal(nil) to [] so
	// consumers can range over it safely.
	assert.NotNil(t, got.ToolBindings)
	assert.Empty(t, got.ToolBindings)
	require.NotNil(t, got.LastRunAt)
	assert.WithinDuration(t, lastRun, *got.LastRunAt, time.Second)
	require.NotNil(t, got.NextRunAt)
	assert.WithinDuration(t, nextRun, *got.NextRunAt, time.Second)

	// ListStellarMissions exercises the shared scanStellarMissionRow helper
	// (as opposed to GetStellarMission's inlined scan), so cover that path
	// as well with the same row.
	missions, err := s.ListStellarMissions(ctx, userID, 10, 0)
	require.NoError(t, err)
	require.Len(t, missions, 1)
	assert.NotNil(t, missions[0].ToolBindings)
	assert.Empty(t, missions[0].ToolBindings)
	require.NotNil(t, missions[0].LastRunAt)
	require.NotNil(t, missions[0].NextRunAt)
}

// TestScanStellarMissionRow_InvalidToolBindingsJSON exercises the
// json.Unmarshal-error arm of scanStellarMissionRow by inserting a mission
// whose tool_bindings column holds a value that is not valid JSON.
func TestScanStellarMissionRow_InvalidToolBindingsJSON(t *testing.T) {
	s := newTestStore(t)
	const userID = "scan-user-bad-json"

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stellar_missions
			(id, user_id, name, goal, schedule, trigger_type, provider_policy,
			 memory_scope, enabled, tool_bindings, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		uuid.NewString(), userID, "bad-bindings", "goal", "0 * * * *", "cron",
		"hybrid", "mission", 1, "{not-json",
	)
	require.NoError(t, err)

	_, err = s.ListStellarMissions(ctx, userID, 10, 0)
	if err == nil {
		t.Fatal("expected error from ListStellarMissions when tool_bindings is invalid JSON")
	}
}

// TestUpdateStellarPreferences_NilPinnedClustersDefaultsToEmpty covers the
// `pinnedClusters == nil` normalization arm of UpdateStellarPreferences and
// verifies the persisted row round-trips as an empty (non-nil) slice.
func TestUpdateStellarPreferences_NilPinnedClustersDefaultsToEmpty(t *testing.T) {
	s := newTestStore(t)
	const userID = "prefs-nil-user"

	err := s.UpdateStellarPreferences(ctx, &StellarPreferences{
		UserID:          userID,
		DefaultProvider: "ollama",
		ExecutionMode:   "local-only",
		Timezone:        "UTC",
		ProactiveMode:   true,
		PinnedClusters:  nil,
	})
	require.NoError(t, err)

	got, err := s.GetStellarPreferences(ctx, userID)
	require.NoError(t, err)
	require.NotNil(t, got.PinnedClusters)
	assert.Empty(t, got.PinnedClusters)
}
