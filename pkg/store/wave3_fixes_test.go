package store

// Regression tests for the store/concurrency hardening wave3 fixes
// (#6603-#6617). These exist separately from sqlite_test.go so the new
// coverage is easy to locate and reviewers can verify each fix has a
// direct failing-before / passing-after test.

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// markNotificationTestBody / markNotificationTestTitle are stable dummy
// values used by the ownership-scoped mark-as-read tests — no magic
// strings inline.
const (
	markNotificationTestTitle = "wave3 test notification"
	markNotificationTestBody  = "ownership check fixture"
)

// TestMarkNotificationReadByUser_RejectsCrossUserMarkRead exercises the
// security fix for #6611. Previously any authenticated user could PUT
// /notifications/:id/read for any id — the handler just called
// MarkNotificationRead(id) without verifying ownership, so user A could
// mark user B's notifications as read (a privilege-escalation class bug
// because notifications can expose PR status, failure messages, etc.).
// The store-level fix adds an AND user_id = ? clause and returns a
// not-found error when the update touches zero rows; this test pins that
// behaviour so any regression (e.g. someone "cleaning up" the extra
// WHERE clause) fails loudly.
func TestMarkNotificationReadByUser_RejectsCrossUserMarkRead(t *testing.T) {
	s := newTestStore(t)

	alice := createTestUser(t, s, "alice-gh", "alice")
	bob := createTestUser(t, s, "bob-gh", "bob")

	// Create a notification owned by alice.
	aliceNotif := &models.Notification{
		UserID:           alice.ID,
		NotificationType: models.NotificationType("info"),
		Title:            markNotificationTestTitle,
		Message:          markNotificationTestBody,
	}
	require.NoError(t, s.CreateNotification(aliceNotif))
	require.NotEqual(t, uuid.Nil, aliceNotif.ID)

	// Bob tries to mark alice's notification as read — must fail.
	err := s.MarkNotificationReadByUser(aliceNotif.ID, bob.ID)
	require.Error(t, err, "cross-user mark-as-read must be rejected")
	assert.Contains(t, err.Error(), "not found")

	// The notification must still be unread (the offending UPDATE must
	// not have been executed at all).
	unread, err := s.GetUnreadNotificationCount(alice.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, unread, "alice's notification must still be unread after bob's attempt")

	// Alice can mark her own notification — must succeed.
	require.NoError(t, s.MarkNotificationReadByUser(aliceNotif.ID, alice.ID))
	unread, err = s.GetUnreadNotificationCount(alice.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, unread, "alice's own mark-read must succeed")
}

// gpuQuotaConcurrentActors is the number of goroutines that race to create
// reservations in TestCreateGPUReservationWithCapacity_AtomicQuotaCheck.
// 10 is enough to reliably trigger the TOCTOU window on modernc/sqlite.
const gpuQuotaConcurrentActors = 10

// gpuQuotaTestCapacity is the cluster capacity cap the TOCTOU test
// enforces. Each goroutine asks for 1 GPU, so exactly 5 of the 10
// concurrent creates should succeed.
const gpuQuotaTestCapacity = 5

// gpuQuotaPerRequest is the per-request GPU count used by every goroutine
// in the TOCTOU test. Keep at 1 so the arithmetic stays obvious.
const gpuQuotaPerRequest = 1

// TestCreateGPUReservationWithCapacity_AtomicQuotaCheck exercises the fix
// for #6612. The previous flow was "SELECT SUM(gpu_count) THEN INSERT",
// which under WAL mode lets two concurrent creates both observe the same
// stale reserved total, both pass the check, and push the cluster above
// its declared capacity. The atomic INSERT ... WHERE (SELECT SUM(...))
// variant closes the race; this test pins that exactly capacity/per-request
// goroutines win — no over-allocation.
func TestCreateGPUReservationWithCapacity_AtomicQuotaCheck(t *testing.T) {
	s := newTestStore(t)
	owner := createTestUser(t, s, "gpu-race-owner", "gpu-race")

	var (
		wg        sync.WaitGroup
		successes int64
		quotaErrs int64
		otherErrs int64
		start     = make(chan struct{})
	)

	wg.Add(gpuQuotaConcurrentActors)
	for i := 0; i < gpuQuotaConcurrentActors; i++ {
		go func(idx int) {
			defer wg.Done()
			<-start // align all goroutines to fire at the same instant
			r := &models.GPUReservation{
				UserID:        owner.ID,
				UserName:      owner.GitHubLogin,
				Title:         "race-entry",
				Cluster:       "cluster-race",
				Namespace:     "ns",
				GPUCount:      gpuQuotaPerRequest,
				StartDate:     time.Now().Format(time.RFC3339),
				DurationHours: 1,
			}
			err := s.CreateGPUReservationWithCapacity(r, gpuQuotaTestCapacity)
			switch {
			case err == nil:
				atomic.AddInt64(&successes, 1)
			case err == ErrGPUQuotaExceeded:
				atomic.AddInt64(&quotaErrs, 1)
			default:
				atomic.AddInt64(&otherErrs, 1)
				t.Logf("unexpected error in goroutine %d: %v", idx, err)
			}
		}(i)
	}
	close(start)
	wg.Wait()

	assert.Equal(t, int64(0), atomic.LoadInt64(&otherErrs),
		"no unexpected errors should escape the atomic insert")
	assert.Equal(t, int64(gpuQuotaTestCapacity), atomic.LoadInt64(&successes),
		"exactly capacity/per-request inserts must succeed, never more")
	assert.Equal(t, int64(gpuQuotaConcurrentActors-gpuQuotaTestCapacity),
		atomic.LoadInt64(&quotaErrs),
		"remaining inserts must be rejected with ErrGPUQuotaExceeded")

	// Authoritative check against the DB: the stored total cannot exceed
	// the capacity cap, even under concurrent load.
	total, err := s.GetClusterReservedGPUCount("cluster-race", nil)
	require.NoError(t, err)
	assert.LessOrEqual(t, total, gpuQuotaTestCapacity,
		"stored reserved total must never exceed cluster capacity (#6612)")
}

// TestCreateGPUReservationWithCapacity_ZeroCapacityFallsThrough pins the
// documented behaviour: when the capacity provider is unavailable (nil or
// returns zero), CreateGPUReservationWithCapacity must behave identically
// to the un-capped CreateGPUReservation — otherwise disabling the check
// would silently block every reservation.
func TestCreateGPUReservationWithCapacity_ZeroCapacityFallsThrough(t *testing.T) {
	s := newTestStore(t)
	owner := createTestUser(t, s, "no-cap-owner", "no-cap")

	r := &models.GPUReservation{
		UserID:        owner.ID,
		UserName:      owner.GitHubLogin,
		Title:         "no-cap",
		Cluster:       "cluster-no-cap",
		Namespace:     "ns",
		GPUCount:      100,
		StartDate:     time.Now().Format(time.RFC3339),
		DurationHours: 1,
	}
	require.NoError(t, s.CreateGPUReservationWithCapacity(r, 0))

	list, err := s.ListUserGPUReservations(owner.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
}

// TestSaveOnboardingResponse_UpsertPreservesIdentity pins #6606. The old
// INSERT OR REPLACE implementation would delete and re-insert the row on
// every save, which (in SQLite) bumps the internal rowid and fires any
// ON DELETE triggers — effectively churning the row identity. The new
// ON CONFLICT DO UPDATE path writes the new answer in place.
func TestSaveOnboardingResponse_UpsertPreservesIdentity(t *testing.T) {
	s := newTestStore(t)
	u := createTestUser(t, s, "onboard-gh", "onboard")

	first := &models.OnboardingResponse{
		UserID:      u.ID,
		QuestionKey: "role",
		Answer:      "platform",
	}
	require.NoError(t, s.SaveOnboardingResponse(first))
	firstID := first.ID

	// Second save with the same (user_id, question_key) must UPDATE in
	// place and leave the answer reflected in GetOnboardingResponses.
	second := &models.OnboardingResponse{
		UserID:      u.ID,
		QuestionKey: "role",
		Answer:      "app-dev",
	}
	require.NoError(t, s.SaveOnboardingResponse(second))

	got, err := s.GetOnboardingResponses(u.ID)
	require.NoError(t, err)
	require.Len(t, got, 1, "upsert must not create a second row for the same (user_id, question_key)")
	assert.Equal(t, "app-dev", got[0].Answer)
	// The id on disk is the id from the FIRST insert — ON CONFLICT DO
	// UPDATE does not touch the primary key.
	assert.Equal(t, firstID.String(), got[0].ID.String(),
		"ON CONFLICT DO UPDATE must preserve the row's primary key (#6606)")
}

// TestUpdateCard_MissingReturnsErrNoRows pins #6610. The previous
// implementation silently succeeded on a no-op UPDATE, so a typo in the
// card id or a card deleted concurrently would return nil from
// UpdateCard and let the handler respond 200 with stale data.
func TestUpdateCard_MissingReturnsErrNoRows(t *testing.T) {
	s := newTestStore(t)

	// Build a Card with a random id that has never been inserted.
	missing := &models.Card{
		ID:          uuid.New(),
		DashboardID: uuid.New(),
		CardType:    models.CardType("bogus"),
	}
	err := s.UpdateCard(missing)
	require.Error(t, err, "UpdateCard on a non-existent id must return an error")
}

// TestIncrementUserCoins_ContextCancelled pins #6613. After the context
// plumbing change, a cancelled ctx must abort the BEGIN IMMEDIATE
// transaction instead of running to completion with context.Background.
func TestIncrementUserCoins_ContextCancelled(t *testing.T) {
	s := newTestStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before the call so the conn acquire fails fast

	_, err := s.IncrementUserCoins(ctx, "cancelled-user", 10)
	require.Error(t, err, "cancelled ctx must surface as an error, not a silent success")
}

// TestConsumeOAuthState_ContextCancelled pins #6613 for the OAuth path.
func TestConsumeOAuthState_ContextCancelled(t *testing.T) {
	s := newTestStore(t)
	require.NoError(t, s.StoreOAuthState("cancel-state", oauthStateTestTTL))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := s.ConsumeOAuthState(ctx, "cancel-state")
	require.Error(t, err, "cancelled ctx must surface as an error on ConsumeOAuthState")
}

// TestGetBulkUtilizationSnapshots_RejectsOversizedBatch pins #6605 at the
// store level. The handler layer also rejects oversized fan-outs, but the
// store must refuse them too so internal callers cannot bypass the cap.
func TestGetBulkUtilizationSnapshots_RejectsOversizedBatch(t *testing.T) {
	s := newTestStore(t)

	// Build an id slice one larger than the cap.
	ids := make([]string, bulkUtilizationMaxIDs+1)
	for i := range ids {
		ids[i] = uuid.New().String()
	}
	_, err := s.GetBulkUtilizationSnapshots(ids)
	require.ErrorIs(t, err, ErrTooManyIDs)
}
