package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateStellarExecution_Basic(t *testing.T) {
	s := newTestStore(t)
	exec := &StellarExecution{
		UserID:      "user-1",
		MissionID:   "mission-1",
		TriggerType: "manual",
		Status:      "running",
		RawInput:    "check prod",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))
	require.NotEmpty(t, exec.ID)
}

func TestCreateStellarExecution_DefaultsApplied(t *testing.T) {
	s := newTestStore(t)
	exec := &StellarExecution{
		UserID:      "user-1",
		MissionID:   "mission-1",
		TriggerType: "cron",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))

	got, err := s.GetStellarExecution(ctx, "user-1", exec.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "running", got.Status)
	assert.Equal(t, "{}", got.TriggerData)
	assert.Equal(t, "[]", got.ActionsTaken)
}

func TestCreateStellarExecution_PreservesExplicitID(t *testing.T) {
	s := newTestStore(t)
	exec := &StellarExecution{
		ID:          "explicit-id-999",
		UserID:      "user-1",
		MissionID:   "mission-1",
		TriggerType: "manual",
		Status:      "completed",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))
	assert.Equal(t, "explicit-id-999", exec.ID)
}

func TestGetStellarExecution_NotFound(t *testing.T) {
	s := newTestStore(t)
	got, err := s.GetStellarExecution(ctx, "user-1", "nonexistent")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestGetStellarExecution_WrongUser(t *testing.T) {
	s := newTestStore(t)
	exec := &StellarExecution{
		UserID:      "user-a",
		MissionID:   "m-1",
		TriggerType: "manual",
		Status:      "completed",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))

	got, err := s.GetStellarExecution(ctx, "user-b", exec.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestGetStellarExecution_RoundTrip(t *testing.T) {
	s := newTestStore(t)
	exec := &StellarExecution{
		UserID:        "user-1",
		MissionID:     "mission-1",
		TriggerType:   "manual",
		TriggerData:   `{"key":"val"}`,
		Status:        "completed",
		RawInput:      "check pods",
		EnrichedInput: "enriched: check pods",
		Output:        "all good",
		ActionsTaken:  `["restart"]`,
		TokensInput:   100,
		TokensOutput:  200,
		DurationMs:    1500,
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))

	got, err := s.GetStellarExecution(ctx, "user-1", exec.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, exec.MissionID, got.MissionID)
	assert.Equal(t, "completed", got.Status)
	assert.Equal(t, "check pods", got.RawInput)
	assert.Equal(t, "all good", got.Output)
	assert.Equal(t, 100, got.TokensInput)
	assert.Equal(t, 200, got.TokensOutput)
	assert.Equal(t, 1500, got.DurationMs)
}

func TestListStellarExecutions_Empty(t *testing.T) {
	s := newTestStore(t)
	results, err := s.ListStellarExecutions(ctx, "user-1", "", "", 20, 0)
	require.NoError(t, err)
	assert.Empty(t, results)
}

func TestListStellarExecutions_FilterByMission(t *testing.T) {
	s := newTestStore(t)
	for _, mID := range []string{"m-1", "m-1", "m-2"} {
		exec := &StellarExecution{
			UserID:      "user-1",
			MissionID:   mID,
			TriggerType: "manual",
			Status:      "completed",
		}
		require.NoError(t, s.CreateStellarExecution(ctx, exec))
	}

	results, err := s.ListStellarExecutions(ctx, "user-1", "m-1", "", 20, 0)
	require.NoError(t, err)
	assert.Len(t, results, 2)
	for _, r := range results {
		assert.Equal(t, "m-1", r.MissionID)
	}
}

func TestListStellarExecutions_FilterByStatus(t *testing.T) {
	s := newTestStore(t)
	statuses := []string{"completed", "completed", "failed"}
	for _, st := range statuses {
		exec := &StellarExecution{
			UserID:      "user-1",
			MissionID:   "m-1",
			TriggerType: "manual",
			Status:      st,
		}
		require.NoError(t, s.CreateStellarExecution(ctx, exec))
	}

	results, err := s.ListStellarExecutions(ctx, "user-1", "", "completed", 20, 0)
	require.NoError(t, err)
	assert.Len(t, results, 2)
}

func TestListStellarExecutions_PaginationLimit(t *testing.T) {
	s := newTestStore(t)
	for i := 0; i < 5; i++ {
		exec := &StellarExecution{
			UserID:      "user-1",
			MissionID:   "m-1",
			TriggerType: "manual",
			Status:      "completed",
		}
		require.NoError(t, s.CreateStellarExecution(ctx, exec))
	}

	results, err := s.ListStellarExecutions(ctx, "user-1", "", "", 3, 0)
	require.NoError(t, err)
	assert.Len(t, results, 3)
}

func TestListStellarExecutions_PaginationOffset(t *testing.T) {
	s := newTestStore(t)
	for i := 0; i < 4; i++ {
		exec := &StellarExecution{
			UserID:      "user-1",
			MissionID:   "m-1",
			TriggerType: "manual",
			Status:      "completed",
		}
		require.NoError(t, s.CreateStellarExecution(ctx, exec))
	}

	all, err := s.ListStellarExecutions(ctx, "user-1", "", "", 20, 0)
	require.NoError(t, err)
	require.Len(t, all, 4)

	page2, err := s.ListStellarExecutions(ctx, "user-1", "", "", 2, 2)
	require.NoError(t, err)
	assert.Len(t, page2, 2)
}

func TestGetExecutionsSince(t *testing.T) {
	s := newTestStore(t)
	before := time.Now().UTC().Add(-2 * time.Hour)

	exec := &StellarExecution{
		UserID:      "user-1",
		MissionID:   "m-1",
		TriggerType: "manual",
		Status:      "completed",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))

	results, err := s.GetExecutionsSince(ctx, before)
	require.NoError(t, err)
	assert.NotEmpty(t, results)
	assert.Equal(t, exec.ID, results[0].ID)
}

func TestGetExecutionsSince_FutureThreshold(t *testing.T) {
	s := newTestStore(t)
	exec := &StellarExecution{
		UserID:      "user-1",
		MissionID:   "m-1",
		TriggerType: "manual",
		Status:      "completed",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))

	future := time.Now().UTC().Add(1 * time.Hour)
	results, err := s.GetExecutionsSince(ctx, future)
	require.NoError(t, err)
	assert.Empty(t, results)
}
