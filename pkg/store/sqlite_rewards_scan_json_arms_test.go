package store

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The scanUserTokenUsageRow decoder in sqlite_rewards.go has three JSON arms:
//   1. empty tokens_by_category -> initialize an empty map (already covered)
//   2. malformed JSON -> return a "decode tokens_by_category" error
//   3. JSON "null" literal -> unmarshal succeeds with a nil map, then the
//      "u.TokensByCategory == nil" guard reassigns an empty map
// Arms 2 and 3 were previously uncovered. These tests write the offending
// row directly with ExecContext so GetUserTokenUsage takes the malformed and
// null paths respectively, which no other test exercises.

const (
	// User-id fixtures for the two new drift tests. Kept as consts so both
	// the raw SQL setup and the GetUserTokenUsage assertion use the same
	// identifier without magic strings.
	corruptedCategoriesUserID = "user-token-corrupted-json"
	nullCategoriesUserID      = "user-token-null-json"
)

func TestGetUserTokenUsage_MalformedCategoriesJSONReturnsDecodeError(t *testing.T) {
	store := newTestStore(t)

	// Insert a row whose tokens_by_category is syntactically invalid JSON.
	// The scanner must surface a "decode tokens_by_category" error, not
	// silently drop the breakdown or panic.
	_, err := store.db.ExecContext(ctx, `
		INSERT INTO user_token_usage
		  (user_id, total_tokens, tokens_by_category, last_agent_session_id, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, corruptedCategoriesUserID, int64(42), "{not-json", "session-corrupt")
	require.NoError(t, err)

	got, err := store.GetUserTokenUsage(ctx, corruptedCategoriesUserID)
	require.Error(t, err, "corrupted tokens_by_category must surface as an error")
	assert.Nil(t, got, "decode error must not leak a partial UserTokenUsage")
	assert.Contains(t, err.Error(), "decode tokens_by_category",
		"error must identify the offending column so ops can locate the corrupt row")
}

func TestGetUserTokenUsage_NullCategoriesJSONYieldsEmptyMap(t *testing.T) {
	store := newTestStore(t)

	// A tokens_by_category value of the JSON literal "null" is valid JSON
	// but decodes into a nil map. The scanner's post-unmarshal nil-guard
	// must convert that back to an empty map so callers can Range/Len it
	// without a nil check.
	_, err := store.db.ExecContext(ctx, `
		INSERT INTO user_token_usage
		  (user_id, total_tokens, tokens_by_category, last_agent_session_id, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, nullCategoriesUserID, int64(7), "null", "session-null")
	require.NoError(t, err)

	got, err := store.GetUserTokenUsage(ctx, nullCategoriesUserID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, nullCategoriesUserID, got.UserID)
	assert.NotNil(t, got.TokensByCategory,
		"JSON 'null' must be normalized to an empty map, not left nil")
	assert.Equal(t, 0, len(got.TokensByCategory))
}
