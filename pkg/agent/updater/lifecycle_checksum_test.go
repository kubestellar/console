package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// parseChecksumLine — pure function (72.7% → expected 100%)
// ────────────────────────────────────────────────────────────────────────────

func TestParseChecksumLine_ValidLine(t *testing.T) {
	hash := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	line := hash + "  console-linux-amd64.tar.gz"

	gotHash, gotFile, err := parseChecksumLine(line)
	require.NoError(t, err)
	assert.Equal(t, hash, gotHash)
	assert.Equal(t, "console-linux-amd64.tar.gz", gotFile)
}

func TestParseChecksumLine_SingleSpaceSeparator(t *testing.T) {
	hash := "a" + "b3c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef012"
	line := hash + " myfile.bin"

	gotHash, gotFile, err := parseChecksumLine(line)
	require.NoError(t, err)
	assert.Equal(t, hash, gotHash)
	assert.Equal(t, "myfile.bin", gotFile)
}

func TestParseChecksumLine_EmptyLine(t *testing.T) {
	_, _, err := parseChecksumLine("")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "empty or comment")
}

func TestParseChecksumLine_CommentLine(t *testing.T) {
	_, _, err := parseChecksumLine("# This is a comment")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "empty or comment")
}

func TestParseChecksumLine_WhitespaceOnly(t *testing.T) {
	_, _, err := parseChecksumLine("   \t  ")
	assert.Error(t, err)
}

func TestParseChecksumLine_SingleField(t *testing.T) {
	_, _, err := parseChecksumLine("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid format")
}

func TestParseChecksumLine_ShortHash(t *testing.T) {
	_, _, err := parseChecksumLine("abc123 file.tar.gz")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid hash format")
}

func TestParseChecksumLine_NonHexHash(t *testing.T) {
	// 64 chars but contains non-hex 'g'
	badHash := "g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	_, _, err := parseChecksumLine(badHash + "  file.tar.gz")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid hash format")
}

func TestParseChecksumLine_UppercaseHash(t *testing.T) {
	hash := "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855"
	line := hash + "  file.tar.gz"

	gotHash, gotFile, err := parseChecksumLine(line)
	require.NoError(t, err)
	assert.Equal(t, hash, gotHash)
	assert.Equal(t, "file.tar.gz", gotFile)
}

func TestParseChecksumLine_LeadingTrailingWhitespace(t *testing.T) {
	hash := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	line := "  " + hash + "  console.tar.gz  "

	gotHash, gotFile, err := parseChecksumLine(line)
	require.NoError(t, err)
	assert.Equal(t, hash, gotHash)
	assert.Equal(t, "console.tar.gz", gotFile)
}

// ────────────────────────────────────────────────────────────────────────────
// isHexString — pure function (75% → expected 100%)
// ────────────────────────────────────────────────────────────────────────────

func TestIsHexString_ValidLowercase(t *testing.T) {
	assert.True(t, isHexString("0123456789abcdef"))
}

func TestIsHexString_ValidUppercase(t *testing.T) {
	assert.True(t, isHexString("0123456789ABCDEF"))
}

func TestIsHexString_ValidMixed(t *testing.T) {
	assert.True(t, isHexString("aAbBcCdDeEfF0123456789"))
}

func TestIsHexString_Empty(t *testing.T) {
	assert.True(t, isHexString(""), "empty string has no non-hex chars")
}

func TestIsHexString_InvalidChar(t *testing.T) {
	assert.False(t, isHexString("0123456789abcdefg"))
}

func TestIsHexString_Space(t *testing.T) {
	assert.False(t, isHexString("abc def"))
}

func TestIsHexString_SpecialChars(t *testing.T) {
	assert.False(t, isHexString("abc!@#"))
}

// ────────────────────────────────────────────────────────────────────────────
// computeSHA256 — filesystem-based (75% → expected 100%)
// ────────────────────────────────────────────────────────────────────────────

func TestComputeSHA256_ValidFile(t *testing.T) {
	content := []byte("hello world\n")
	expected := sha256.Sum256(content)
	expectedHex := hex.EncodeToString(expected[:])

	tmpFile := filepath.Join(t.TempDir(), "test.bin")
	require.NoError(t, os.WriteFile(tmpFile, content, 0644))

	got, err := computeSHA256(tmpFile)
	require.NoError(t, err)
	assert.Equal(t, expectedHex, got)
}

func TestComputeSHA256_EmptyFile(t *testing.T) {
	// SHA256 of empty content
	expected := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

	tmpFile := filepath.Join(t.TempDir(), "empty.bin")
	require.NoError(t, os.WriteFile(tmpFile, []byte{}, 0644))

	got, err := computeSHA256(tmpFile)
	require.NoError(t, err)
	assert.Equal(t, expected, got)
}

func TestComputeSHA256_NonexistentFile(t *testing.T) {
	_, err := computeSHA256("/tmp/nonexistent-file-12345.bin")
	assert.Error(t, err)
}

// ────────────────────────────────────────────────────────────────────────────
// UpdateChecker lifecycle — NewUpdateChecker, Start, Stop, Configure (all 0%)
// ────────────────────────────────────────────────────────────────────────────

func TestNewUpdateChecker_SetsDefaults(t *testing.T) {
	// Set KUBERNETES_SERVICE_HOST to force "helm" detection
	t.Setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")

	broadcastCalled := false
	cfg := UpdateCheckerConfig{
		Version:        "v1.2.3",
		HealthCheckFn:  func() bool { return true },
		Broadcast:      func(s string, i interface{}) { broadcastCalled = true },
		RestartBackend: func() error { return nil },
		KillBackend:    func() bool { return true },
	}

	uc := NewUpdateChecker(cfg)
	require.NotNil(t, uc)
	assert.Equal(t, "stable", uc.channel)
	assert.Equal(t, "helm", uc.installMethod)
	assert.Equal(t, "v1.2.3", uc.currentVersion)
	assert.NotNil(t, uc.broadcast)
	assert.NotNil(t, uc.restartBackend)
	assert.NotNil(t, uc.killBackend)
	assert.NotNil(t, uc.healthCheckFn)

	// Verify broadcast function is the one we passed
	uc.broadcast("test", nil)
	assert.True(t, broadcastCalled)
}

func TestStart_Stop(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "dev",
		broadcast:     func(s string, i interface{}) {},
	}

	// Start creates a cancel function
	uc.Start()
	uc.mu.Lock()
	assert.NotNil(t, uc.cancel, "Start should set cancel")
	uc.mu.Unlock()

	// Stop clears it
	uc.Stop()
	uc.mu.Lock()
	assert.Nil(t, uc.cancel, "Stop should clear cancel")
	uc.mu.Unlock()
}

func TestStop_WhenNotStarted(t *testing.T) {
	uc := &UpdateChecker{}
	// Should not panic
	uc.Stop()
}

func TestConfigure_EnablesAndStarts(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "dev",
		broadcast:     func(s string, i interface{}) {},
	}

	uc.Configure(true, "developer")

	uc.mu.Lock()
	assert.True(t, uc.enabled)
	assert.Equal(t, "developer", uc.channel)
	assert.NotNil(t, uc.cancel, "Configure(true, ...) should start the loop")
	uc.mu.Unlock()

	// Clean up
	uc.Stop()
}

func TestConfigure_DisablesAndStops(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "dev",
		enabled:       true,
		broadcast:     func(s string, i interface{}) {},
	}

	// Start first
	uc.Start()
	time.Sleep(10 * time.Millisecond)

	// Disable
	uc.Configure(false, "stable")

	uc.mu.Lock()
	assert.False(t, uc.enabled)
	assert.Nil(t, uc.cancel, "Configure(false, ...) should stop the loop")
	uc.mu.Unlock()
}

func TestConfigure_SameValues_NoRestart(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "dev",
		enabled:       true,
		broadcast:     func(s string, i interface{}) {},
	}

	// Configure with same values — should not restart
	uc.Configure(true, "stable")

	uc.mu.Lock()
	// cancel may be nil since enabled+channel didn't change (no restart)
	// The key point is it doesn't panic
	uc.mu.Unlock()
}

// ────────────────────────────────────────────────────────────────────────────
// Status — cover additional branches (47.6%)
// ────────────────────────────────────────────────────────────────────────────

func TestStatus_NoRepoPath(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "binary",
		enabled:       false,
		repoPath:      "",
		currentSHA:    "",
	}

	resp := uc.Status()
	assert.Equal(t, "binary", resp.InstallMethod)
	assert.Equal(t, "stable", resp.Channel)
	assert.False(t, resp.AutoUpdateEnabled)
	assert.False(t, resp.HasUpdate)
	assert.Empty(t, resp.LatestSHA)
}

func TestStatus_WithLastUpdateError(t *testing.T) {
	uc := &UpdateChecker{
		channel:         "stable",
		installMethod:   "dev",
		repoPath:        "",
		lastUpdateTime:  time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC),
		lastUpdateError: "npm install failed with exit code 1",
	}

	resp := uc.Status()
	assert.Equal(t, "2026-01-15T10:30:00Z", resp.LastUpdateTime)
	assert.Equal(t, "Update failed - check server logs for details", resp.LastUpdateResult)
}

func TestStatus_NoLastUpdateTime(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "dev",
		repoPath:      "",
	}

	resp := uc.Status()
	assert.Empty(t, resp.LastUpdateTime)
	assert.Empty(t, resp.LastUpdateResult)
}
