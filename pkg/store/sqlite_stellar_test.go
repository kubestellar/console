package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestStellarPreferencesRoundTrip(t *testing.T) {
	s := newTestStore(t)
	const userID = "stellar-user-1"

	defaults, err := s.GetStellarPreferences(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, userID, defaults.UserID)
	require.Equal(t, stellarDefaultProvider, defaults.DefaultProvider)
	require.Equal(t, stellarExecutionHybrid, defaults.ExecutionMode)
	require.Equal(t, stellarDefaultTimezone, defaults.Timezone)
	require.True(t, defaults.ProactiveMode)
	require.NotNil(t, defaults.PinnedClusters)

	err = s.UpdateStellarPreferences(ctx, &StellarPreferences{
		UserID:          userID,
		DefaultProvider: "ollama",
		ExecutionMode:   "local-only",
		Timezone:        "Asia/Kolkata",
		ProactiveMode:   false,
		PinnedClusters:  []string{"prod-1", "staging-1"},
	})
	require.NoError(t, err)

	got, err := s.GetStellarPreferences(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, "ollama", got.DefaultProvider)
	require.Equal(t, "local-only", got.ExecutionMode)
	require.Equal(t, "Asia/Kolkata", got.Timezone)
	require.False(t, got.ProactiveMode)
	require.Equal(t, []string{"prod-1", "staging-1"}, got.PinnedClusters)
}

func TestStellarMissionExecutionAndMemory(t *testing.T) {
	s := newTestStore(t)
	const userID = "stellar-user-2"

	mission := &StellarMission{
		UserID:         userID,
		Name:           "overnight-watch",
		Goal:           "Summarize rollouts and failures overnight",
		Schedule:       "0 1 * * *",
		TriggerType:    "cron",
		ProviderPolicy: "hybrid-fallback",
		MemoryScope:    "mission",
		Enabled:        true,
		ToolBindings:   []string{"kubernetes", "prometheus"},
	}
	require.NoError(t, s.CreateStellarMission(ctx, mission))
	require.NotEmpty(t, mission.ID)

	execution := &StellarExecution{
		UserID:      userID,
		MissionID:   mission.ID,
		TriggerType: "manual",
		TriggerData: "{}",
		Status:      "completed",
		RawInput:    "check production",
		Output:      "all good",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, execution))
	require.NotEmpty(t, execution.ID)

	executions, err := s.ListStellarExecutions(ctx, userID, mission.ID, "", 20, 0)
	require.NoError(t, err)
	require.Len(t, executions, 1)

	entry := &StellarMemoryEntry{
		UserID:      userID,
		Cluster:     "prod-a",
		Namespace:   "default",
		Category:    "incident",
		Summary:     "CrashLoop recovered after restart",
		RawContent:  "details",
		Tags:        []string{"crashloop", "recovery"},
		MissionID:   mission.ID,
		ExecutionID: execution.ID,
	}
	require.NoError(t, s.CreateStellarMemoryEntry(ctx, entry))
	require.NotEmpty(t, entry.ID)

	entries, err := s.SearchStellarMemoryEntries(ctx, userID, "CrashLoop", 20)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Equal(t, "incident", entries[0].Category)
}

func TestStellarActionsAndNotifications(t *testing.T) {
	s := newTestStore(t)
	const userID = "stellar-user-3"

	when := time.Now().UTC().Add(-1 * time.Minute)
	action := &StellarAction{
		UserID:      userID,
		Description: "Scale worker deployment",
		ActionType:  "ScaleDeployment",
		Parameters:  `{"deployment":"worker","replicas":5}`,
		Cluster:     "prod-a",
		Namespace:   "default",
		ScheduledAt: &when,
		Status:      "pending_approval",
		CreatedBy:   userID,
	}
	require.NoError(t, s.CreateStellarAction(ctx, action))
	require.NotEmpty(t, action.ID)

	require.NoError(t, s.ApproveStellarAction(ctx, userID, action.ID, userID))
	completed, err := s.CompleteDueStellarActions(ctx, time.Now().UTC())
	require.NoError(t, err)
	require.Len(t, completed, 1)
	require.Equal(t, "completed", completed[0].Status)

	notification := &StellarNotification{
		UserID:    userID,
		Type:      "MissionUpdate",
		Severity:  "info",
		Title:     "Action completed",
		Body:      "Scaled worker deployment",
		ActionID:  action.ID,
		DedupeKey: "action-completed:" + action.ID,
	}
	require.NoError(t, s.CreateStellarNotification(ctx, notification))
	require.NotEmpty(t, notification.ID)

	items, err := s.ListStellarNotifications(ctx, userID, 20, false)
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, "Action completed", items[0].Title)

	count, err := s.CountUnreadStellarNotifications(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, 1, count)

	require.NoError(t, s.MarkStellarNotificationRead(ctx, userID, notification.ID))
	count, err = s.CountUnreadStellarNotifications(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, 0, count)
}
