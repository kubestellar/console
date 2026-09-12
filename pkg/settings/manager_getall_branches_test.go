package settings

import (
	"encoding/base64"
	"os"
	"testing"
)

// TestGetAll_EnvTokenFallback covers the "no user token stored" env-fallback
// branch in GetAll (manager.go around line 346): when Encrypted.FeedbackGitHubToken
// is nil and FEEDBACK_GITHUB_TOKEN is set, GetAll must copy the env value into
// all.FeedbackGitHubToken with Source == GitHubTokenSourceEnv and set
// HasFeedbackToken=true. Regressing this branch would silently drop the
// deploy-time env fallback and appear to users as "no token configured".
func TestGetAll_EnvTokenFallback(t *testing.T) {
	sm := newTestManager(t)

	// Ensure no stored token so the env fallback arm is reached.
	sm.mu.Lock()
	sm.settings.Encrypted.FeedbackGitHubToken = nil
	sm.settings.Encrypted.GitHubToken = nil
	sm.mu.Unlock()

	// Isolate env vars for this test only.
	t.Setenv("FEEDBACK_GITHUB_TOKEN", "ghp_env_fallback")
	t.Setenv("GITHUB_TOKEN", "")

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if all.FeedbackGitHubToken != "ghp_env_fallback" {
		t.Errorf("FeedbackGitHubToken = %q, want %q", all.FeedbackGitHubToken, "ghp_env_fallback")
	}
	if all.FeedbackGitHubTokenSource != GitHubTokenSourceEnv {
		t.Errorf("FeedbackGitHubTokenSource = %q, want %q", all.FeedbackGitHubTokenSource, GitHubTokenSourceEnv)
	}
	if !all.HasFeedbackToken {
		t.Errorf("HasFeedbackToken = false, want true")
	}
}

// TestGetAll_EnvFallbackSkippedWhenStoredTokenPresent asserts the negative
// case: with a stored token, the env var must not overwrite it and the
// source must remain "settings".
func TestGetAll_EnvFallbackSkippedWhenStoredTokenPresent(t *testing.T) {
	sm := newTestManager(t)

	enc, err := encrypt(sm.key, []byte("ghp_stored"))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	sm.mu.Lock()
	sm.settings.Encrypted.FeedbackGitHubToken = enc
	sm.settings.Encrypted.GitHubToken = nil
	sm.mu.Unlock()

	t.Setenv("FEEDBACK_GITHUB_TOKEN", "ghp_env_should_be_ignored")

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if all.FeedbackGitHubToken != "ghp_stored" {
		t.Errorf("FeedbackGitHubToken = %q, want stored value", all.FeedbackGitHubToken)
	}
	if all.FeedbackGitHubTokenSource == GitHubTokenSourceEnv {
		t.Errorf("Source must not be env when a stored token is present, got %q", all.FeedbackGitHubTokenSource)
	}
}

// corruptField builds an EncryptedField whose base64 decodes cleanly but
// whose GCM Open will fail (nonce length is correct but auth tag/cipher
// bytes are garbage). This forces the decrypt error branch inside GetAll
// without tripping the "invalid nonce length" or "decode ciphertext"
// pre-checks in decrypt().
func corruptField() *EncryptedField {
	nonce := make([]byte, nonceBytes) // valid length, all zeros
	cipher := make([]byte, 32)        // garbage — GCM tag will not verify
	return &EncryptedField{
		Ciphertext: base64.StdEncoding.EncodeToString(cipher),
		IV:         base64.StdEncoding.EncodeToString(nonce),
	}
}

// TestGetAll_DecryptAPIKeysError covers the "failed to decrypt API keys"
// slog.Error branch: when the stored APIKeys ciphertext is unauthenticated
// (wrong key or tampered), GetAll must return successfully with an empty
// APIKeys map rather than failing the whole read. This preserves availability
// of the settings surface even when a single ciphertext is corrupt.
func TestGetAll_DecryptAPIKeysError(t *testing.T) {
	sm := newTestManager(t)

	sm.mu.Lock()
	sm.settings.Encrypted.APIKeys = corruptField()
	sm.mu.Unlock()

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll returned error, expected soft-fail: %v", err)
	}
	if len(all.APIKeys) != 0 {
		t.Errorf("APIKeys = %v, want empty map on decrypt failure", all.APIKeys)
	}
}

// TestGetAll_ParseAPIKeysError covers the "failed to parse decrypted API
// keys" branch: ciphertext decrypts successfully but the plaintext is not
// a valid map[string]APIKeyEntry JSON blob. GetAll must again soft-fail
// with an empty APIKeys map.
func TestGetAll_ParseAPIKeysError(t *testing.T) {
	sm := newTestManager(t)

	// Encrypt a plaintext that is *not* valid map JSON.
	enc, err := encrypt(sm.key, []byte("this is not json"))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	sm.mu.Lock()
	sm.settings.Encrypted.APIKeys = enc
	sm.mu.Unlock()

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if len(all.APIKeys) != 0 {
		t.Errorf("APIKeys = %v, want empty map on JSON parse failure", all.APIKeys)
	}
}

// TestGetAll_DecryptGitHubTokenError covers the "failed to decrypt GitHub
// token" branch: the FeedbackGitHubToken ciphertext is corrupt and cannot
// be authenticated. GetAll must not fail — it must leave FeedbackGitHubToken
// empty (and then may fall back to env, but we clear env here so we can
// distinguish the two branches).
func TestGetAll_DecryptGitHubTokenError(t *testing.T) {
	sm := newTestManager(t)

	sm.mu.Lock()
	sm.settings.Encrypted.FeedbackGitHubToken = corruptField()
	sm.settings.Encrypted.GitHubToken = nil
	sm.mu.Unlock()

	t.Setenv("FEEDBACK_GITHUB_TOKEN", "")
	t.Setenv("GITHUB_TOKEN", "")
	// Make sure any inherited value is cleared.
	os.Unsetenv("FEEDBACK_GITHUB_TOKEN")
	os.Unsetenv("GITHUB_TOKEN")

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if all.FeedbackGitHubToken != "" {
		t.Errorf("FeedbackGitHubToken = %q, want empty on decrypt failure", all.FeedbackGitHubToken)
	}
	if all.HasFeedbackToken {
		t.Errorf("HasFeedbackToken = true, want false when decrypt fails and env is empty")
	}
}

// TestGetAll_DecryptNotificationsError covers the "failed to decrypt
// notifications" branch: soft-fails to a zero-value NotificationSecrets.
func TestGetAll_DecryptNotificationsError(t *testing.T) {
	sm := newTestManager(t)

	sm.mu.Lock()
	sm.settings.Encrypted.Notifications = corruptField()
	sm.mu.Unlock()

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if all.Notifications != (NotificationSecrets{}) {
		t.Errorf("Notifications = %+v, want zero value on decrypt failure", all.Notifications)
	}
}

// TestGetAll_ParseNotificationsError covers the "failed to parse decrypted
// notifications" branch: ciphertext decrypts but the plaintext is not a
// valid NotificationSecrets JSON blob.
func TestGetAll_ParseNotificationsError(t *testing.T) {
	sm := newTestManager(t)

	enc, err := encrypt(sm.key, []byte("[not, an, object]"))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	sm.mu.Lock()
	sm.settings.Encrypted.Notifications = enc
	sm.mu.Unlock()

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if all.Notifications != (NotificationSecrets{}) {
		t.Errorf("Notifications = %+v, want zero value on JSON parse failure", all.Notifications)
	}
}

// TestMigrateLegacyGitHubToken_NilGuards covers the early-return branches
// in migrateLegacyGitHubToken (`sm.settings == nil || sm.key == nil`). The
// guards exist to prevent nil-deref if the method is ever reached via a
// code path that skipped the GetAll pre-check. The test calls the method
// directly, verifying it returns silently and leaves state intact.
func TestMigrateLegacyGitHubToken_NilGuards(t *testing.T) {
	// Case 1: nil settings — must not panic.
	sm1 := &SettingsManager{}
	sm1.migrateLegacyGitHubToken()

	// Case 2: settings present but key nil — must not touch fields.
	sm2 := &SettingsManager{settings: DefaultSettings()}
	sm2.settings.Encrypted.GitHubToken = &EncryptedField{Ciphertext: "x", IV: "y"}
	sm2.migrateLegacyGitHubToken()
	if sm2.settings.Encrypted.GitHubToken == nil {
		t.Errorf("nil-key guard should leave legacy GitHubToken untouched")
	}
	if sm2.settings.Encrypted.FeedbackGitHubToken != nil {
		t.Errorf("nil-key guard must not migrate into FeedbackGitHubToken")
	}
}

// TestMigrateLegacyGitHubToken_ClearsWhenNewAlreadySet covers the branch
// that clears the legacy field when the new field is *already* populated
// (rather than overwriting it). Regressing this would either double-store
// the credential or clobber the user's current token with the stale one.
func TestMigrateLegacyGitHubToken_ClearsWhenNewAlreadySet(t *testing.T) {
	sm := newTestManager(t)

	legacy, err := encrypt(sm.key, []byte("ghp_legacy"))
	if err != nil {
		t.Fatalf("encrypt legacy: %v", err)
	}
	current, err := encrypt(sm.key, []byte("ghp_current"))
	if err != nil {
		t.Fatalf("encrypt current: %v", err)
	}
	sm.mu.Lock()
	sm.settings.Encrypted.GitHubToken = legacy
	sm.settings.Encrypted.FeedbackGitHubToken = current
	sm.migrateLegacyGitHubToken()
	// Legacy must be cleared.
	if sm.settings.Encrypted.GitHubToken != nil {
		t.Errorf("legacy GitHubToken should be cleared when new one exists")
	}
	// Current must survive unchanged.
	if sm.settings.Encrypted.FeedbackGitHubToken != current {
		t.Errorf("existing FeedbackGitHubToken must not be overwritten by legacy value")
	}
	sm.mu.Unlock()
}
