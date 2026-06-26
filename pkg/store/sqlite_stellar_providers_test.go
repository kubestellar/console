package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSQLiteStellarProvidersCRUD(t *testing.T) {
	store := OpenTestDB(t)
	apiKey := []byte("ciphertext")

	openAI := &StellarProviderConfig{
		UserID:      "user-1",
		Provider:    "openai",
		DisplayName: "OpenAI",
		BaseURL:     "https://api.openai.com/v1",
		Model:       "gpt-4.1",
		APIKeyEnc:   apiKey,
		IsDefault:   true,
		IsActive:    true,
	}
	anthropic := &StellarProviderConfig{
		UserID:      "user-1",
		Provider:    "anthropic",
		DisplayName: "Anthropic",
		BaseURL:     "https://api.anthropic.com",
		Model:       "claude-sonnet-4.5",
		APIKeyEnc:   apiKey,
		IsDefault:   false,
		IsActive:    true,
	}

	for _, cfg := range []*StellarProviderConfig{openAI, anthropic} {
		require.NoError(t, store.UpsertProviderConfig(ctx, cfg))
		require.NotEmpty(t, cfg.ID)
	}

	list, err := store.GetUserProviderConfigs(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, list, 2)
	require.Equal(t, openAI.ID, list[0].ID)
	require.Equal(t, anthropic.ID, list[1].ID)
	require.Equal(t, apiKey, list[0].APIKeyEnc)

	defaultProvider, err := store.GetUserDefaultProvider(ctx, "user-1")
	require.NoError(t, err)
	require.NotNil(t, defaultProvider)
	require.Equal(t, openAI.ID, defaultProvider.ID)

	openAI.DisplayName = "OpenAI Updated"
	openAI.Model = "gpt-4.1-mini"
	openAI.LastLatency = 23
	require.NoError(t, store.UpsertProviderConfig(ctx, openAI))
	require.NoError(t, store.SetUserDefaultProvider(ctx, "user-1", anthropic.ID))
	require.NoError(t, store.UpdateProviderLatency(ctx, anthropic.ID, 187))

	list, err = store.GetUserProviderConfigs(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, list, 2)
	require.Equal(t, anthropic.ID, list[0].ID)
	require.True(t, list[0].IsDefault)
	require.Equal(t, 187, list[0].LastLatency)
	require.NotNil(t, list[0].LastTested)
	require.Equal(t, "OpenAI Updated", list[1].DisplayName)
	require.Equal(t, "gpt-4.1-mini", list[1].Model)
	require.False(t, list[1].IsDefault)

	require.NoError(t, store.DeleteProviderConfig(ctx, openAI.ID, "other-user"))
	list, err = store.GetUserProviderConfigs(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, list, 2)

	require.NoError(t, store.DeleteProviderConfig(ctx, openAI.ID, "user-1"))
	list, err = store.GetUserProviderConfigs(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.Equal(t, anthropic.ID, list[0].ID)
}

func TestSQLiteStellarProvidersEmptyAndInactiveDefault(t *testing.T) {
	tests := []struct {
		name      string
		setup     func(t *testing.T, store *SQLiteStore)
		wantNil   bool
		wantCount int
	}{
		{name: "no configs", setup: func(t *testing.T, store *SQLiteStore) {}, wantNil: true, wantCount: 0},
		{name: "inactive default ignored", setup: func(t *testing.T, store *SQLiteStore) {
			cfg := &StellarProviderConfig{UserID: "user-1", Provider: "openai", DisplayName: "OpenAI", APIKeyEnc: []byte("x"), IsDefault: true, IsActive: false}
			require.NoError(t, store.UpsertProviderConfig(ctx, cfg))
		}, wantNil: true, wantCount: 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := OpenTestDB(t)
			tc.setup(t, store)

			list, err := store.GetUserProviderConfigs(ctx, "user-1")
			require.NoError(t, err)
			require.Len(t, list, tc.wantCount)

			defaultProvider, err := store.GetUserDefaultProvider(ctx, "user-1")
			require.NoError(t, err)
			if tc.wantNil {
				require.Nil(t, defaultProvider)
			}
		})
	}
}

func TestSQLiteStellarProvidersErrors(t *testing.T) {
	t.Run("invalid timestamp payload fails scans", func(t *testing.T) {
		store := OpenTestDB(t)
		now := time.Now().UTC().Format(time.RFC3339)
		_, err := store.db.ExecContext(ctx, `INSERT INTO stellar_provider_configs (id, user_id, provider, display_name, api_key_enc, is_default, is_active, last_tested, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			"cfg-1", "user-1", "openai", "OpenAI", []byte("cipher"), 1, 1, "not-a-time", now, now)
		require.NoError(t, err)

		_, err = store.GetUserProviderConfigs(ctx, "user-1")
		require.Error(t, err)
	})

	t.Run("closed db surfaces write errors", func(t *testing.T) {
		store := OpenTestDB(t)
		require.NoError(t, store.Close())

		err := store.UpsertProviderConfig(ctx, &StellarProviderConfig{UserID: "user-1", Provider: "openai", APIKeyEnc: []byte("cipher")})
		require.Error(t, err)
	})
}
