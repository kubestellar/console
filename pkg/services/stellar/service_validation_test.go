package stellar_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/services/stellar"
	"github.com/kubestellar/console/pkg/store"
)

func TestValidateAction(t *testing.T) {
	svc := stellar.New(newMockStore())

	t.Run("nil action", func(t *testing.T) {
		err := svc.ValidateAction(nil)
		require.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrInvalidInput)
	})

	t.Run("missing user ID", func(t *testing.T) {
		action := &store.StellarAction{
			ActionType: "RestartDeployment",
		}
		err := svc.ValidateAction(action)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "user ID")
	})

	t.Run("missing action type", func(t *testing.T) {
		action := &store.StellarAction{
			UserID: "user-1",
		}
		err := svc.ValidateAction(action)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "action type")
	})

	t.Run("valid action", func(t *testing.T) {
		action := &store.StellarAction{
			UserID:     "user-1",
			ActionType: "RestartDeployment",
		}
		err := svc.ValidateAction(action)
		assert.NoError(t, err)
	})
}

func TestActionValidationEdgeCases(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()

	t.Run("create action with invalid input returns error", func(t *testing.T) {
		action := &store.StellarAction{ID: "bad-1"}
		err := svc.CreateAction(ctx, action)
		require.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrInvalidInput)
	})

	t.Run("create nil action returns error", func(t *testing.T) {
		err := svc.CreateAction(ctx, nil)
		require.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrInvalidInput)
	})
}

func TestGetPreferencesNotFound(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()

	_, err := svc.GetPreferences(ctx, "user-no-prefs")
	require.Error(t, err)
	assert.ErrorIs(t, err, stellar.ErrNotFound)
}
