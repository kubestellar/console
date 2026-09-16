package stellar_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/services/stellar"
	"github.com/kubestellar/console/pkg/store"
)

func TestListMissionsLimitNormalization(t *testing.T) {
	ms := newMockStore()
	svc := stellar.New(ms)
	ctx := context.Background()
	userID := "user-1"

	ms.missions["m1"] = &store.StellarMission{ID: "m1", UserID: userID, Name: "X"}

	tests := []struct {
		name  string
		limit int
	}{
		{"zero limit normalizes", 0},
		{"negative limit normalizes", -5},
		{"exceeds max normalizes", stellar.MaxListLimit + 100},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			missions, err := svc.ListMissions(ctx, userID, tc.limit, 0)
			require.NoError(t, err)
			assert.Len(t, missions, 1)
		})
	}
}

func TestListExecutionsLimitNormalization(t *testing.T) {
	ms := newMockStore()
	svc := stellar.New(ms)
	ctx := context.Background()
	userID := "user-1"

	ms.executions["e1"] = &store.StellarExecution{ID: "e1", UserID: userID, MissionID: "m1", Status: "completed"}

	tests := []struct {
		name  string
		limit int
	}{
		{"zero limit normalizes", 0},
		{"negative limit normalizes", -1},
		{"exceeds max normalizes", stellar.MaxListLimit + 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			executions, err := svc.ListExecutions(ctx, userID, "", "", tc.limit, 0)
			require.NoError(t, err)
			assert.Len(t, executions, 1)
		})
	}
}

func TestListActionsLimitNormalization(t *testing.T) {
	ms := newMockStore()
	svc := stellar.New(ms)
	ctx := context.Background()
	userID := "user-1"

	ms.actions["a1"] = &store.StellarAction{ID: "a1", UserID: userID, ActionType: "Restart", Status: "pending"}

	tests := []struct {
		name  string
		limit int
	}{
		{"zero limit normalizes", 0},
		{"negative limit normalizes", -10},
		{"exceeds max normalizes", stellar.MaxListLimit + 50},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actions, err := svc.ListActions(ctx, userID, "", tc.limit, 0)
			require.NoError(t, err)
			assert.Len(t, actions, 1)
		})
	}
}

func TestListMemoryEntriesLimitNormalization(t *testing.T) {
	ms := newMockStore()
	svc := stellar.New(ms)
	ctx := context.Background()
	userID := "user-1"

	ms.memoryEntries = []store.StellarMemoryEntry{{ID: "mem-1", UserID: userID, Category: "obs"}}

	tests := []struct {
		name  string
		limit int
	}{
		{"zero limit normalizes", 0},
		{"negative limit normalizes", -3},
		{"exceeds max normalizes", stellar.MaxListLimit + 200},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			entries, err := svc.ListMemoryEntries(ctx, userID, "", "", tc.limit, 0)
			require.NoError(t, err)
			assert.Len(t, entries, 1)
		})
	}
}

func TestSearchMemoryEntriesLimitNormalization(t *testing.T) {
	ms := newMockStore()
	svc := stellar.New(ms)
	ctx := context.Background()
	userID := "user-1"

	ms.memoryEntries = []store.StellarMemoryEntry{{ID: "mem-1", UserID: userID, Category: "obs"}}

	tests := []struct {
		name  string
		limit int
	}{
		{"zero limit normalizes", 0},
		{"negative limit normalizes", -1},
		{"exceeds max normalizes", stellar.MaxListLimit + 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			entries, err := svc.SearchMemoryEntries(ctx, userID, "test", tc.limit)
			require.NoError(t, err)
			assert.Len(t, entries, 1)
		})
	}
}

func TestListNotificationsLimitNormalization(t *testing.T) {
	ms := newMockStore()
	svc := stellar.New(ms)
	ctx := context.Background()
	userID := "user-1"

	ms.notifications["n1"] = &store.StellarNotification{ID: "n1", UserID: userID, Title: "Alert"}

	tests := []struct {
		name  string
		limit int
	}{
		{"zero limit normalizes", 0},
		{"negative limit normalizes", -1},
		{"exceeds max normalizes", stellar.MaxListLimit + 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			notifications, err := svc.ListNotifications(ctx, userID, tc.limit, false)
			require.NoError(t, err)
			assert.Len(t, notifications, 1)
		})
	}
}
