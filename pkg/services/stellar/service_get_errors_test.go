package stellar_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/services/stellar"
	"github.com/kubestellar/console/pkg/store"
)

// errStellarStore embeds *mockStore so it satisfies the full store.Store
// interface, and overrides the five Get* methods that back the service
// Get{Mission,Execution,Action,Notification,Preferences} functions so
// they return a synthetic store error.
//
// Existing tests only cover the happy path and the nil-result (ErrNotFound)
// path for these five functions, leaving the "store returned err" branch —
// the actual data-layer failure path — untested at 83.3% statement
// coverage each. This file drives that branch for every Get*.
type errStellarStore struct {
	*mockStore
	err error
}

func newErrStellarStore(err error) *errStellarStore {
	return &errStellarStore{mockStore: newMockStore(), err: err}
}

func (e *errStellarStore) GetStellarMission(ctx context.Context, userID, missionID string) (*store.StellarMission, error) {
	return nil, e.err
}

func (e *errStellarStore) GetStellarExecution(ctx context.Context, userID, executionID string) (*store.StellarExecution, error) {
	return nil, e.err
}

func (e *errStellarStore) GetStellarAction(ctx context.Context, userID, actionID string) (*store.StellarAction, error) {
	return nil, e.err
}

func (e *errStellarStore) GetStellarNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error) {
	return nil, e.err
}

func (e *errStellarStore) GetStellarPreferences(ctx context.Context, userID string) (*store.StellarPreferences, error) {
	return nil, e.err
}

func TestGetMission_StoreError(t *testing.T) {
	sentinel := errors.New("db: connection reset by peer")
	svc := stellar.New(newErrStellarStore(sentinel))

	m, err := svc.GetMission(context.Background(), "user-1", "mission-1")
	require.Error(t, err)
	assert.Nil(t, m)
	assert.ErrorIs(t, err, sentinel, "GetMission must propagate the store error verbatim, not wrap or replace it with ErrNotFound")
	assert.NotErrorIs(t, err, stellar.ErrNotFound)
}

func TestGetExecution_StoreError(t *testing.T) {
	sentinel := errors.New("db: query timeout")
	svc := stellar.New(newErrStellarStore(sentinel))

	e, err := svc.GetExecution(context.Background(), "user-1", "exec-1")
	require.Error(t, err)
	assert.Nil(t, e)
	assert.ErrorIs(t, err, sentinel)
	assert.NotErrorIs(t, err, stellar.ErrNotFound)
}

func TestGetAction_StoreError(t *testing.T) {
	sentinel := errors.New("db: relation \"stellar_actions\" does not exist")
	svc := stellar.New(newErrStellarStore(sentinel))

	a, err := svc.GetAction(context.Background(), "user-1", "action-1")
	require.Error(t, err)
	assert.Nil(t, a)
	assert.ErrorIs(t, err, sentinel)
	assert.NotErrorIs(t, err, stellar.ErrNotFound)
}

func TestGetNotification_StoreError(t *testing.T) {
	sentinel := errors.New("db: too many connections")
	svc := stellar.New(newErrStellarStore(sentinel))

	n, err := svc.GetNotification(context.Background(), "user-1", "notif-1")
	require.Error(t, err)
	assert.Nil(t, n)
	assert.ErrorIs(t, err, sentinel)
	assert.NotErrorIs(t, err, stellar.ErrNotFound)
}

func TestGetPreferences_StoreError(t *testing.T) {
	sentinel := errors.New("db: transaction aborted")
	svc := stellar.New(newErrStellarStore(sentinel))

	p, err := svc.GetPreferences(context.Background(), "user-1")
	require.Error(t, err)
	assert.Nil(t, p)
	assert.ErrorIs(t, err, sentinel)
	assert.NotErrorIs(t, err, stellar.ErrNotFound)
}
