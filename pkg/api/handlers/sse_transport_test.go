package handlers

import (
	"context"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testConcurrentRegistrations = 64
	testConcurrentCancelCalls   = 16
	testCancelWaitTimeout       = 100 * time.Millisecond
)

func resetSSEGlobalState(t *testing.T) uint64 {
	t.Helper()

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()

	start := sseSessionSeq
	sseSessions = make(map[uuid.UUID]map[uint64]context.CancelFunc)

	return start
}

func registryUserCount(t *testing.T) int {
	t.Helper()

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()

	return len(sseSessions)
}

func registrySessionCountForUser(t *testing.T, userID uuid.UUID) int {
	t.Helper()

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()

	return len(sseSessions[userID])
}

func registryHasUser(t *testing.T, userID uuid.UUID) bool {
	t.Helper()

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()

	_, ok := sseSessions[userID]
	return ok
}

func registryHasSession(t *testing.T, userID uuid.UUID, id uint64) bool {
	t.Helper()

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()

	sessions, ok := sseSessions[userID]
	if !ok {
		return false
	}

	_, exists := sessions[id]
	return exists
}

func currentSSESessionSeq(t *testing.T) uint64 {
	t.Helper()

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()

	return sseSessionSeq
}

func assertContextCancelled(t *testing.T, ctx context.Context) {
	t.Helper()

	select {
	case <-ctx.Done():
	case <-time.After(testCancelWaitTimeout):
		t.Fatal("expected context to be cancelled")
	}
}

func assertContextNotCancelled(t *testing.T, ctx context.Context) {
	t.Helper()

	select {
	case <-ctx.Done():
		t.Fatal("expected context to remain active")
	default:
	}
}

func TestRegisterSSESession(t *testing.T) {
	testCases := []struct {
		name string
		run  func(t *testing.T, start uint64)
	}{
		{
			name: "register single session returns next relative ID and creates user map",
			run: func(t *testing.T, start uint64) {
				userID := uuid.New()

				id := registerSSESession(userID, func() {})

				require.Equal(t, start+1, id)
				assert.True(t, registryHasUser(t, userID))
				assert.Equal(t, 1, registrySessionCountForUser(t, userID))
				assert.True(t, registryHasSession(t, userID, id))
			},
		},
		{
			name: "register multiple sessions for same user returns incrementing IDs",
			run: func(t *testing.T, start uint64) {
				userID := uuid.New()

				firstID := registerSSESession(userID, func() {})
				secondID := registerSSESession(userID, func() {})
				thirdID := registerSSESession(userID, func() {})

				assert.Equal(t, start+1, firstID)
				assert.Equal(t, start+2, secondID)
				assert.Equal(t, start+3, thirdID)
				assert.Equal(t, 3, registrySessionCountForUser(t, userID))
			},
		},
		{
			name: "register sessions for different users creates separate maps",
			run: func(t *testing.T, start uint64) {
				firstUserID := uuid.New()
				secondUserID := uuid.New()

				firstID := registerSSESession(firstUserID, func() {})
				secondID := registerSSESession(secondUserID, func() {})

				assert.Equal(t, start+1, firstID)
				assert.Equal(t, start+2, secondID)
				assert.Equal(t, 2, registryUserCount(t))
				assert.Equal(t, 1, registrySessionCountForUser(t, firstUserID))
				assert.Equal(t, 1, registrySessionCountForUser(t, secondUserID))
			},
		},
		{
			name: "IDs are monotonically increasing across users",
			run: func(t *testing.T, _ uint64) {
				firstUserID := uuid.New()
				secondUserID := uuid.New()

				firstID := registerSSESession(firstUserID, func() {})
				secondID := registerSSESession(secondUserID, func() {})
				thirdID := registerSSESession(firstUserID, func() {})

				assert.Less(t, firstID, secondID)
				assert.Less(t, secondID, thirdID)
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			start := resetSSEGlobalState(t)
			testCase.run(t, start)
		})
	}
}

func TestUnregisterSSESession(t *testing.T) {
	testCases := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "unregister existing session removes it",
			run: func(t *testing.T) {
				userID := uuid.New()

				firstID := registerSSESession(userID, func() {})
				secondID := registerSSESession(userID, func() {})

				unregisterSSESession(userID, firstID)

				assert.False(t, registryHasSession(t, userID, firstID))
				assert.True(t, registryHasSession(t, userID, secondID))
				assert.Equal(t, 1, registrySessionCountForUser(t, userID))
			},
		},
		{
			name: "unregister last session for user cleans up user map",
			run: func(t *testing.T) {
				userID := uuid.New()

				id := registerSSESession(userID, func() {})

				unregisterSSESession(userID, id)

				assert.False(t, registryHasUser(t, userID))
				assert.Equal(t, 0, registryUserCount(t))
			},
		},
		{
			name: "unregister non existent session is safe",
			run: func(t *testing.T) {
				userID := uuid.New()

				id := registerSSESession(userID, func() {})

				assert.NotPanics(t, func() {
					unregisterSSESession(userID, id+1000)
				})
				assert.True(t, registryHasSession(t, userID, id))
				assert.Equal(t, 1, registrySessionCountForUser(t, userID))
			},
		},
		{
			name: "unregister non existent user is safe",
			run: func(t *testing.T) {
				userID := uuid.New()

				assert.NotPanics(t, func() {
					unregisterSSESession(userID, 1)
				})
				assert.False(t, registryHasUser(t, userID))
				assert.Equal(t, 0, registryUserCount(t))
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			resetSSEGlobalState(t)
			testCase.run(t)
		})
	}
}

func TestCancelUserSSEStreams(t *testing.T) {
	testCases := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "cancels all contexts for a user and removes user from registry",
			run: func(t *testing.T) {
				userID := uuid.New()

				ctxOne, cancelOne := context.WithCancel(context.Background())
				ctxTwo, cancelTwo := context.WithCancel(context.Background())
				ctxThree, cancelThree := context.WithCancel(context.Background())

				registerSSESession(userID, cancelOne)
				registerSSESession(userID, cancelTwo)
				registerSSESession(userID, cancelThree)

				CancelUserSSEStreams(userID)

				assertContextCancelled(t, ctxOne)
				assertContextCancelled(t, ctxTwo)
				assertContextCancelled(t, ctxThree)
				assert.False(t, registryHasUser(t, userID))
			},
		},
		{
			name: "safe to call for user with no streams",
			run: func(t *testing.T) {
				userID := uuid.New()

				assert.NotPanics(t, func() {
					CancelUserSSEStreams(userID)
				})
				assert.False(t, registryHasUser(t, userID))
			},
		},
		{
			name: "does not affect other users streams",
			run: func(t *testing.T) {
				targetUserID := uuid.New()
				otherUserID := uuid.New()

				targetCtx, targetCancel := context.WithCancel(context.Background())
				otherCtx, otherCancel := context.WithCancel(context.Background())

				registerSSESession(targetUserID, targetCancel)
				otherID := registerSSESession(otherUserID, otherCancel)

				CancelUserSSEStreams(targetUserID)

				assertContextCancelled(t, targetCtx)
				assertContextNotCancelled(t, otherCtx)
				assert.False(t, registryHasUser(t, targetUserID))
				assert.True(t, registryHasUser(t, otherUserID))
				assert.True(t, registryHasSession(t, otherUserID, otherID))

				otherCancel()
				assertContextCancelled(t, otherCtx)
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			resetSSEGlobalState(t)
			testCase.run(t)
		})
	}
}

func TestSSETransportConstants(t *testing.T) {
	durationCases := []struct {
		name string
		got  time.Duration
		want time.Duration
	}{
		{
			name: "sseOverallDeadline is 30 seconds",
			got:  sseOverallDeadline,
			want: 30 * time.Second,
		},
		{
			name: "ssePerClusterTimeout is 10 seconds",
			got:  ssePerClusterTimeout,
			want: 10 * time.Second,
		},
		{
			name: "sseSlowClusterTimeout is 3 seconds",
			got:  sseSlowClusterTimeout,
			want: 3 * time.Second,
		},
	}

	for _, testCase := range durationCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, testCase.got)
		})
	}

	limitCases := []struct {
		name string
		got  int
		want int
	}{
		{
			name: "defaultWarningEventsLimit is 50",
			got:  defaultWarningEventsLimit,
			want: 50,
		},
		{
			name: "maxWarningEventsLimit is 500",
			got:  maxWarningEventsLimit,
			want: 500,
		},
	}

	for _, testCase := range limitCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, testCase.got)
		})
	}
}

func TestSSESessionRegistryConcurrentRegister(t *testing.T) {
	start := resetSSEGlobalState(t)
	userID := uuid.New()

	startCh := make(chan struct{})
	idsCh := make(chan uint64, testConcurrentRegistrations)

	var wg sync.WaitGroup
	for range testConcurrentRegistrations {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-startCh
			idsCh <- registerSSESession(userID, func() {})
		}()
	}

	close(startCh)
	wg.Wait()
	close(idsCh)

	ids := make([]uint64, 0, testConcurrentRegistrations)
	for id := range idsCh {
		ids = append(ids, id)
	}

	require.Len(t, ids, testConcurrentRegistrations)

	sort.Slice(ids, func(i, j int) bool {
		return ids[i] < ids[j]
	})

	for index, id := range ids {
		assert.Equal(t, start+uint64(index)+1, id)
	}

	assert.Equal(t, testConcurrentRegistrations, registrySessionCountForUser(t, userID))
	assert.Equal(t, start+testConcurrentRegistrations, currentSSESessionSeq(t))
}

func TestSSESessionRegistryConcurrentRegisterAndCancel(t *testing.T) {
	resetSSEGlobalState(t)

	userID := uuid.New()
	startCh := make(chan struct{})
	ctxCh := make(chan context.Context, testConcurrentRegistrations)

	var registerWG sync.WaitGroup
	for range testConcurrentRegistrations {
		registerWG.Add(1)
		go func() {
			defer registerWG.Done()

			ctx, cancel := context.WithCancel(context.Background())
			ctxCh <- ctx

			<-startCh
			registerSSESession(userID, cancel)
		}()
	}

	var cancelWG sync.WaitGroup
	cancelWG.Add(1)
	go func() {
		defer cancelWG.Done()
		<-startCh
		for range testConcurrentCancelCalls {
			CancelUserSSEStreams(userID)
		}
	}()

	assert.NotPanics(t, func() {
		close(startCh)
		registerWG.Wait()
		cancelWG.Wait()
	})

	close(ctxCh)

	CancelUserSSEStreams(userID)

	contexts := make([]context.Context, 0, testConcurrentRegistrations)
	for ctx := range ctxCh {
		contexts = append(contexts, ctx)
	}

	require.Len(t, contexts, testConcurrentRegistrations)
	for _, ctx := range contexts {
		assertContextCancelled(t, ctx)
	}

	assert.False(t, registryHasUser(t, userID))
}
