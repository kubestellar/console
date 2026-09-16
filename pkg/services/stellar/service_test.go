package stellar_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/services/stellar"
	"github.com/kubestellar/console/pkg/store"
)

func TestMissionValidation(t *testing.T) {
	svc := stellar.New(newMockStore())
	_ = context.Background() // available for future subtests

	t.Run("valid mission", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:            "test-id",
			UserID:        "user-1",
			Name:          "Test Mission",
			Goal:          "Test goal",
			ExecutionMode: "hybrid",
			TriggerType:   "manual",
			Tools:         []string{"kubectl", "helm"},
		}
		err := svc.ValidateMission(mission)
		assert.NoError(t, err)
	})

	t.Run("name too long", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   string(make([]byte, stellar.MaxNameLength+1)),
			Goal:   "Test goal",
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "exceeds")
	})

	t.Run("goal too long", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   "Test",
			Goal:   string(make([]byte, stellar.MaxGoalLength+1)),
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "goal exceeds")
	})

	t.Run("too many tools", func(t *testing.T) {
		tools := make([]string, stellar.MaxToolsPerMission+1)
		for i := range tools {
			tools[i] = "tool"
		}
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   "Test",
			Goal:   "Test goal",
			Tools:  tools,
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "more than")
	})

	t.Run("invalid execution mode", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:            "test-id",
			UserID:        "user-1",
			Name:          "Test",
			Goal:          "Test goal",
			ExecutionMode: "invalid-mode",
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "execution mode")
	})
}

func TestMissionCRUD(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	mission := &store.StellarMission{
		ID:            "mission-1",
		UserID:        userID,
		Name:          "Test Mission",
		Goal:          "Test goal",
		ExecutionMode: "hybrid",
		TriggerType:   "manual",
		CreatedAt:     time.Now(),
	}

	t.Run("create mission", func(t *testing.T) {
		err := svc.CreateMission(ctx, mission)
		assert.NoError(t, err)
	})

	t.Run("get mission", func(t *testing.T) {
		retrieved, err := svc.GetMission(ctx, userID, mission.ID)
		require.NoError(t, err)
		assert.Equal(t, mission.Name, retrieved.Name)
	})

	t.Run("list missions", func(t *testing.T) {
		missions, err := svc.ListMissions(ctx, userID, 50, 0)
		require.NoError(t, err)
		assert.Len(t, missions, 1)
	})

	t.Run("update mission", func(t *testing.T) {
		mission.Name = "Updated Mission"
		err := svc.UpdateMission(ctx, mission)
		assert.NoError(t, err)
	})

	t.Run("delete mission", func(t *testing.T) {
		err := svc.DeleteMission(ctx, userID, mission.ID)
		assert.NoError(t, err)
	})
}

func TestMissionValidationEdgeCases(t *testing.T) {
	svc := stellar.New(newMockStore())

	t.Run("nil mission", func(t *testing.T) {
		err := svc.ValidateMission(nil)
		require.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrInvalidInput)
	})

	t.Run("empty name", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   "",
			Goal:   "Test goal",
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "name is required")
	})

	t.Run("schedule too long", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:       "test-id",
			UserID:   "user-1",
			Name:     "Test",
			Goal:     "Test goal",
			Schedule: string(make([]byte, stellar.MaxScheduleLength+1)),
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "schedule exceeds")
	})

	t.Run("tool name too long", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   "Test",
			Goal:   "Test goal",
			Tools:  []string{string(make([]byte, stellar.MaxToolNameLength+1))},
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "tool name exceeds")
	})

	t.Run("invalid trigger type", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:          "test-id",
			UserID:      "user-1",
			Name:        "Test",
			Goal:        "Test goal",
			TriggerType: "invalid-trigger",
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "trigger type")
	})
}

func TestCreateMissionValidation(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()

	t.Run("create mission with empty name returns error", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:     "m-1",
			UserID: "user-1",
			Name:   "",
			Goal:   "some goal",
		}
		err := svc.CreateMission(ctx, mission)
		require.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrInvalidInput)
	})

	t.Run("update mission with nil returns error", func(t *testing.T) {
		err := svc.UpdateMission(ctx, nil)
		require.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrInvalidInput)
	})

	t.Run("create mission with all valid trigger types", func(t *testing.T) {
		triggers := []string{"manual", "cron", "kubernetes-event", "prometheus-alert", "github-webhook", "api", "chained-completion"}
		for _, trigger := range triggers {
			mission := &store.StellarMission{
				ID:          "m-" + trigger,
				UserID:      "user-1",
				Name:        "Mission " + trigger,
				TriggerType: trigger,
			}
			err := svc.CreateMission(ctx, mission)
			assert.NoError(t, err, "trigger type %q should be valid", trigger)
		}
	})

	t.Run("create mission with all valid execution modes", func(t *testing.T) {
		modes := []string{"local-only", "cloud-only", "hybrid"}
		for _, mode := range modes {
			mission := &store.StellarMission{
				ID:            "m-" + mode,
				UserID:        "user-1",
				Name:          "Mission " + mode,
				ExecutionMode: mode,
			}
			err := svc.CreateMission(ctx, mission)
			assert.NoError(t, err, "execution mode %q should be valid", mode)
		}
	})
}

func TestGetMissionNotFound(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()

	_, err := svc.GetMission(ctx, "user-1", "nonexistent-id")
	require.Error(t, err)
	assert.ErrorIs(t, err, stellar.ErrNotFound)
}
