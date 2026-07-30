package k8s

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// existingWatchDir — was 46.7%
// ────────────────────────────────────────────────────────────────────────────

func TestExistingWatchDir_EmptyPath(t *testing.T) {
	_, err := existingWatchDir("")
	assert.ErrorIs(t, err, ErrNoClusterConfigured)
}

func TestExistingWatchDir_ExistingDir(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	dir, err := existingWatchDir(configPath)
	require.NoError(t, err)
	assert.Equal(t, tmpDir, dir)
}

func TestExistingWatchDir_NestedNonexistentFile(t *testing.T) {
	// Dir exists, but file doesn't — should still return the dir
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "subdir", "config")
	// subdir doesn't exist, so it walks up to tmpDir
	dir, err := existingWatchDir(configPath)
	require.NoError(t, err)
	assert.Equal(t, tmpDir, dir)
}

func TestExistingWatchDir_DeeplyNestedMissing(t *testing.T) {
	// All directories exist
	tmpDir := t.TempDir()
	nested := filepath.Join(tmpDir, "a", "b")
	require.NoError(t, os.MkdirAll(nested, 0o755))
	configPath := filepath.Join(nested, "config")

	dir, err := existingWatchDir(configPath)
	require.NoError(t, err)
	assert.Equal(t, nested, dir)
}

func TestExistingWatchDir_PathIsNotDir(t *testing.T) {
	// If the "directory" is actually a file, should error
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "not-a-dir")
	require.NoError(t, os.WriteFile(filePath, []byte("x"), 0o644))

	// configPath is "not-a-dir/config" — parent is the file, not a dir
	configPath := filepath.Join(filePath, "config")
	_, err := existingWatchDir(configPath)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not a directory")
}

// ────────────────────────────────────────────────────────────────────────────
// formatDuration — was 85.7%
// ────────────────────────────────────────────────────────────────────────────

func TestFormatDuration_Seconds(t *testing.T) {
	assert.Equal(t, "30s", formatDuration(30*1e9)) // 30 seconds
	assert.Equal(t, "0s", formatDuration(0))
}

func TestFormatDuration_Minutes(t *testing.T) {
	assert.Equal(t, "5m", formatDuration(5*60*1e9))
}

func TestFormatDuration_Hours(t *testing.T) {
	assert.Equal(t, "3h", formatDuration(3*60*60*1e9))
}

func TestFormatDuration_Days(t *testing.T) {
	assert.Equal(t, "7d", formatDuration(7*24*60*60*1e9))
}

// ────────────────────────────────────────────────────────────────────────────
// labelsMatch — supplemental edge cases
// ────────────────────────────────────────────────────────────────────────────

func TestLabelsMatch_EmptySelectorMatchesAll(t *testing.T) {
	// Empty selector matches everything
	assert.True(t, labelsMatch(map[string]string{}, map[string]string{"app": "nginx"}))
}

func TestLabelsMatch_SupersetTarget(t *testing.T) {
	selector := map[string]string{"app": "nginx", "env": "prod"}
	target := map[string]string{"app": "nginx", "env": "prod", "version": "v1"}
	assert.True(t, labelsMatch(selector, target))
}

func TestLabelsMatch_ValueMismatch(t *testing.T) {
	selector := map[string]string{"app": "nginx"}
	target := map[string]string{"app": "apache"}
	assert.False(t, labelsMatch(selector, target))
}

func TestLabelsMatch_KeyMissing(t *testing.T) {
	selector := map[string]string{"app": "nginx"}
	target := map[string]string{"env": "prod"}
	assert.False(t, labelsMatch(selector, target))
}

func TestLabelsMatch_EmptyTargetMap(t *testing.T) {
	selector := map[string]string{"app": "nginx"}
	target := map[string]string{}
	assert.False(t, labelsMatch(selector, target))
}
