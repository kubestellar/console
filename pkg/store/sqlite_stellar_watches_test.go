package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testWatchUserID = "watch-test-user"

func makeTestWatch(userID, cluster, kind, name string) *StellarWatch {
	return &StellarWatch{
		UserID:       userID,
		Cluster:      cluster,
		Namespace:    "default",
		ResourceKind: kind,
		ResourceName: name,
		Reason:       "CrashLoopBackOff detected",
	}
}

func TestCreateWatch_RoundTrip(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	w := makeTestWatch(testWatchUserID, "prod", "Pod", "web-api-1")
	id, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)
	require.NotEmpty(t, id)

	// Defaults populated
	assert.Equal(t, "active", w.Status)
	assert.NotNil(t, w.LastEventAt)

	// Retrieve via GetWatchByResource
	got, err := s.GetWatchByResource(ctx, testWatchUserID, "prod", "default", "Pod", "web-api-1")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, id, got.ID)
	assert.Equal(t, testWatchUserID, got.UserID)
	assert.Equal(t, "Pod", got.ResourceKind)
	assert.Equal(t, "web-api-1", got.ResourceName)
	assert.Equal(t, "active", got.Status)
}

func TestCreateWatch_DefaultStatus(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	w := makeTestWatch(testWatchUserID, "dev", "Deployment", "api")
	w.Status = "" // should default to "active"
	_, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)
	assert.Equal(t, "active", w.Status)
}

func TestGetActiveWatches(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Create 2 watches — keep LastEventAt recent to avoid auto-resolve
	now := time.Now().UTC()
	w1 := makeTestWatch(testWatchUserID, "prod", "Pod", "app-1")
	w1.LastEventAt = &now
	_, err := s.CreateWatch(ctx, w1)
	require.NoError(t, err)

	w2 := makeTestWatch(testWatchUserID, "prod", "Pod", "app-2")
	w2.LastEventAt = &now
	_, err = s.CreateWatch(ctx, w2)
	require.NoError(t, err)

	active, err := s.GetActiveWatches(ctx, testWatchUserID)
	require.NoError(t, err)
	assert.Len(t, active, 2)
}

func TestGetActiveWatches_ExcludesResolved(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w := makeTestWatch(testWatchUserID, "prod", "Pod", "resolved-pod")
	w.LastEventAt = &now
	id, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	// Resolve it
	require.NoError(t, s.ResolveWatch(ctx, id, testWatchUserID))

	active, err := s.GetActiveWatches(ctx, testWatchUserID)
	require.NoError(t, err)
	assert.Len(t, active, 0)
}

func TestGetActiveWatchesForCluster(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w1 := makeTestWatch(testWatchUserID, "prod", "Pod", "p1")
	w1.LastEventAt = &now
	_, err := s.CreateWatch(ctx, w1)
	require.NoError(t, err)

	w2 := makeTestWatch(testWatchUserID, "staging", "Pod", "p2")
	w2.LastEventAt = &now
	_, err = s.CreateWatch(ctx, w2)
	require.NoError(t, err)

	// Filter by cluster
	prodWatches, err := s.GetActiveWatchesForCluster(ctx, "prod")
	require.NoError(t, err)
	assert.Len(t, prodWatches, 1)
	assert.Equal(t, "p1", prodWatches[0].ResourceName)

	// Empty cluster returns all
	allWatches, err := s.GetActiveWatchesForCluster(ctx, "")
	require.NoError(t, err)
	assert.Len(t, allWatches, 2)
}

func TestUpdateWatchStatus(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w := makeTestWatch(testWatchUserID, "prod", "Pod", "status-pod")
	w.LastEventAt = &now
	id, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	err = s.UpdateWatchStatus(ctx, id, "paused", "User paused watch", testWatchUserID)
	require.NoError(t, err)

	got, err := s.GetWatchByResource(ctx, testWatchUserID, "prod", "default", "Pod", "status-pod")
	// Since status is no longer "active", GetWatchByResource returns nil
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestUpdateWatchStatus_NotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	err := s.UpdateWatchStatus(ctx, "nonexistent-id", "active", "update", testWatchUserID)
	require.Error(t, err)
	assert.Equal(t, ErrNotFound, err)
}

func TestResolveWatch(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w := makeTestWatch(testWatchUserID, "prod", "Deployment", "api")
	w.LastEventAt = &now
	id, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	require.NoError(t, s.ResolveWatch(ctx, id, testWatchUserID))

	// Verify it's no longer active
	got, err := s.GetWatchByResource(ctx, testWatchUserID, "prod", "default", "Deployment", "api")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestResolveWatch_NotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	err := s.ResolveWatch(ctx, "ghost-id", testWatchUserID)
	require.Error(t, err)
	assert.Equal(t, ErrNotFound, err)
}

func TestResolveWatch_WrongUser(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w := makeTestWatch("alice", "prod", "Pod", "alice-pod")
	w.LastEventAt = &now
	id, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	// Bob cannot resolve Alice's watch
	err = s.ResolveWatch(ctx, id, "bob")
	require.Error(t, err)
	assert.Equal(t, ErrNotFound, err)
}

func TestTouchWatch(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w := makeTestWatch(testWatchUserID, "prod", "Pod", "touch-pod")
	w.LastEventAt = &now
	id, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	newTime := now.Add(5 * time.Minute)
	require.NoError(t, s.TouchWatch(ctx, id, "New event: OOMKilled", newTime))

	got, err := s.GetWatchByResource(ctx, testWatchUserID, "prod", "default", "Pod", "touch-pod")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "New event: OOMKilled", got.LastUpdate)
}

func TestSnoozeWatch(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w := makeTestWatch(testWatchUserID, "prod", "Pod", "snooze-pod")
	w.LastEventAt = &now
	id, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	snoozeUntil := now.Add(2 * time.Hour)
	require.NoError(t, s.SnoozeWatch(ctx, id, testWatchUserID, snoozeUntil))

	got, err := s.GetWatchByResource(ctx, testWatchUserID, "prod", "default", "Pod", "snooze-pod")
	require.NoError(t, err)
	require.NotNil(t, got)
	require.NotNil(t, got.LastChecked)
	// LastChecked set to snooze time
	assert.WithinDuration(t, snoozeUntil, *got.LastChecked, time.Second)
}

func TestSnoozeWatch_NotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	err := s.SnoozeWatch(ctx, "ghost-id", testWatchUserID, time.Now().Add(time.Hour))
	require.Error(t, err)
	assert.Equal(t, ErrNotFound, err)
}

func TestGetWatchByResource_NotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	got, err := s.GetWatchByResource(ctx, testWatchUserID, "prod", "default", "Pod", "nonexistent")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestGetWatchesSince(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w := makeTestWatch(testWatchUserID, "prod", "Pod", "since-pod")
	w.LastEventAt = &now
	_, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	// Query for active watches updated since 1 minute ago
	since := now.Add(-time.Minute)
	results, err := s.GetWatchesSince(ctx, testWatchUserID, since, "active")
	require.NoError(t, err)
	assert.Len(t, results, 1)
	assert.Equal(t, "since-pod", results[0].ResourceName)

	// Query for resolved status — should be empty
	resolved, err := s.GetWatchesSince(ctx, testWatchUserID, since, "resolved")
	require.NoError(t, err)
	assert.Len(t, resolved, 0)
}

func TestResolveInactiveWatches_AutoResolves(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Create a watch with LastEventAt far in the past (> 30 min ago)
	oldTime := time.Now().UTC().Add(-time.Hour)
	w := makeTestWatch(testWatchUserID, "prod", "Pod", "stale-pod")
	w.LastEventAt = &oldTime
	_, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	// GetActiveWatches triggers resolveInactiveWatches
	active, err := s.GetActiveWatches(ctx, testWatchUserID)
	require.NoError(t, err)
	assert.Len(t, active, 0) // stale watch should be auto-resolved
}

func TestResolveInactiveWatches_KeepsRecent(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Create a watch with recent LastEventAt
	now := time.Now().UTC()
	w := makeTestWatch(testWatchUserID, "prod", "Pod", "fresh-pod")
	w.LastEventAt = &now
	_, err := s.CreateWatch(ctx, w)
	require.NoError(t, err)

	active, err := s.GetActiveWatches(ctx, testWatchUserID)
	require.NoError(t, err)
	assert.Len(t, active, 1) // recent watch stays active
}

func TestGetActiveWatches_UserIsolation(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	now := time.Now().UTC()
	w1 := makeTestWatch("alice", "prod", "Pod", "alice-pod")
	w1.LastEventAt = &now
	_, err := s.CreateWatch(ctx, w1)
	require.NoError(t, err)

	w2 := makeTestWatch("bob", "prod", "Pod", "bob-pod")
	w2.LastEventAt = &now
	_, err = s.CreateWatch(ctx, w2)
	require.NoError(t, err)

	alice, err := s.GetActiveWatches(ctx, "alice")
	require.NoError(t, err)
	assert.Len(t, alice, 1)
	assert.Equal(t, "alice-pod", alice[0].ResourceName)

	bob, err := s.GetActiveWatches(ctx, "bob")
	require.NoError(t, err)
	assert.Len(t, bob, 1)
	assert.Equal(t, "bob-pod", bob[0].ResourceName)
}
