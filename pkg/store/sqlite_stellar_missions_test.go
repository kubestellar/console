package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateStellarMission_Basic(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID:  "user-1",
		Name:    "nightly-check",
		Goal:    "Summarize overnight failures",
		Enabled: true,
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))
	require.NotEmpty(t, mission.ID)
}

func TestCreateStellarMission_DefaultsApplied(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID: "user-1",
		Name:   "minimal-mission",
		Goal:   "do something",
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	got, err := s.GetStellarMission(ctx, "user-1", mission.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.NotEmpty(t, got.TriggerType)
	assert.NotEmpty(t, got.ProviderPolicy)
	assert.NotEmpty(t, got.MemoryScope)
	assert.NotNil(t, got.ToolBindings)
}

func TestCreateStellarMission_PreservesExplicitID(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		ID:     "explicit-mission-id",
		UserID: "user-1",
		Name:   "test",
		Goal:   "test goal",
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))
	assert.Equal(t, "explicit-mission-id", mission.ID)
}

func TestCreateStellarMission_ToolBindingsRoundTrip(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID:       "user-1",
		Name:         "tooled-mission",
		Goal:         "use tools",
		ToolBindings: []string{"kubernetes", "prometheus", "helm"},
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	got, err := s.GetStellarMission(ctx, "user-1", mission.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, []string{"kubernetes", "prometheus", "helm"}, got.ToolBindings)
}

func TestCreateStellarMission_NilToolBindingsBecomesEmpty(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID:       "user-1",
		Name:         "no-tools",
		Goal:         "simple mission",
		ToolBindings: nil,
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	got, err := s.GetStellarMission(ctx, "user-1", mission.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.NotNil(t, got.ToolBindings)
	assert.Empty(t, got.ToolBindings)
}

func TestGetStellarMission_NotFound(t *testing.T) {
	s := newTestStore(t)
	got, err := s.GetStellarMission(ctx, "user-1", "nonexistent")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestGetStellarMission_WrongUser(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID: "user-a",
		Name:   "private-mission",
		Goal:   "secret",
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	got, err := s.GetStellarMission(ctx, "user-b", mission.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestListStellarMissions_Empty(t *testing.T) {
	s := newTestStore(t)
	results, err := s.ListStellarMissions(ctx, "user-1", 20, 0)
	require.NoError(t, err)
	assert.Empty(t, results)
}

func TestListStellarMissions_ReturnsCorrectUser(t *testing.T) {
	s := newTestStore(t)
	for _, user := range []string{"user-a", "user-a", "user-b"} {
		m := &StellarMission{UserID: user, Name: "m-" + user, Goal: "goal"}
		require.NoError(t, s.CreateStellarMission(ctx, m))
	}

	results, err := s.ListStellarMissions(ctx, "user-a", 20, 0)
	require.NoError(t, err)
	assert.Len(t, results, 2)
	for _, r := range results {
		assert.Equal(t, "user-a", r.UserID)
	}
}

func TestListStellarMissions_PaginationLimit(t *testing.T) {
	s := newTestStore(t)
	for i := 0; i < 5; i++ {
		m := &StellarMission{UserID: "user-1", Name: "mission", Goal: "goal"}
		require.NoError(t, s.CreateStellarMission(ctx, m))
	}

	results, err := s.ListStellarMissions(ctx, "user-1", 3, 0)
	require.NoError(t, err)
	assert.Len(t, results, 3)
}

func TestUpdateStellarMission_RoundTrip(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID:  "user-1",
		Name:    "original-name",
		Goal:    "original goal",
		Enabled: true,
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	mission.Name = "updated-name"
	mission.Goal = "updated goal"
	mission.Enabled = false
	mission.Schedule = "0 2 * * *"
	mission.ToolBindings = []string{"grafana"}
	require.NoError(t, s.UpdateStellarMission(ctx, mission))

	got, err := s.GetStellarMission(ctx, "user-1", mission.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "updated-name", got.Name)
	assert.Equal(t, "updated goal", got.Goal)
	assert.False(t, got.Enabled)
	assert.Equal(t, "0 2 * * *", got.Schedule)
	assert.Equal(t, []string{"grafana"}, got.ToolBindings)
}

func TestUpdateStellarMission_WrongUserNoOp(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID: "user-a",
		Name:   "original",
		Goal:   "original goal",
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	// update with wrong user
	mission.UserID = "user-b"
	mission.Name = "tampered"
	require.NoError(t, s.UpdateStellarMission(ctx, mission))

	// original should be unchanged
	got, err := s.GetStellarMission(ctx, "user-a", mission.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "original", got.Name)
}

func TestDeleteStellarMission(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID: "user-1",
		Name:   "to-delete",
		Goal:   "goal",
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	require.NoError(t, s.DeleteStellarMission(ctx, "user-1", mission.ID))

	got, err := s.GetStellarMission(ctx, "user-1", mission.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestDeleteStellarMission_WrongUserNoOp(t *testing.T) {
	s := newTestStore(t)
	mission := &StellarMission{
		UserID: "user-a",
		Name:   "protected",
		Goal:   "goal",
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	require.NoError(t, s.DeleteStellarMission(ctx, "user-b", mission.ID))

	got, err := s.GetStellarMission(ctx, "user-a", mission.ID)
	require.NoError(t, err)
	assert.NotNil(t, got)
}

func TestStellarMission_LastRunAtNextRunAt(t *testing.T) {
	s := newTestStore(t)
	lastRun := time.Now().UTC().Add(-1 * time.Hour)
	nextRun := time.Now().UTC().Add(23 * time.Hour)
	mission := &StellarMission{
		UserID:    "user-1",
		Name:      "scheduled",
		Goal:      "goal",
		LastRunAt: &lastRun,
		NextRunAt: &nextRun,
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))

	got, err := s.GetStellarMission(ctx, "user-1", mission.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.NotNil(t, got.LastRunAt)
	require.NotNil(t, got.NextRunAt)
	assert.WithinDuration(t, lastRun, *got.LastRunAt, time.Second)
	assert.WithinDuration(t, nextRun, *got.NextRunAt, time.Second)
}
