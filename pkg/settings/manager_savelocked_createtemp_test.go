package settings

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestSaveLocked_CreateTempFailsWhenDirIsReadOnly covers the
// os.CreateTemp error branch: MkdirAll succeeds because the directory
// already exists, but the directory is read-only so CreateTemp cannot
// place a `.settings-*.tmp` file inside it. saveLocked must surface a
// wrapped "failed to create temp settings file" error.
//
// Running as root (or with any effective-uid override) bypasses POSIX
// permission checks — skip in that case since the test would spuriously
// pass and the branch would remain uncovered anyway.
func TestSaveLocked_CreateTempFailsWhenDirIsReadOnly(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("chmod-based readonly dir semantics differ on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("root bypasses POSIX permission checks; branch unreachable as root")
	}

	dir := t.TempDir()
	settingsDir := filepath.Join(dir, "readonly-settings")
	if err := os.MkdirAll(settingsDir, 0o755); err != nil {
		t.Fatalf("failed to seed settings dir: %v", err)
	}
	// Drop write permission so os.CreateTemp inside cannot create a file.
	if err := os.Chmod(settingsDir, 0o555); err != nil {
		t.Fatalf("failed to chmod settings dir readonly: %v", err)
	}
	t.Cleanup(func() {
		// Restore write bit so t.TempDir cleanup can remove the tree.
		_ = os.Chmod(settingsDir, 0o755)
	})

	sm := &SettingsManager{
		settingsPath: filepath.Join(settingsDir, settingsFileName),
		keyPath:      filepath.Join(dir, keyFileName),
		settings:     DefaultSettings(),
	}

	err := sm.Save()
	if err == nil {
		t.Fatalf("Save() returned nil, want CreateTemp failure")
	}
	if !strings.Contains(err.Error(), "failed to create temp settings file") {
		t.Errorf("Save() error missing CreateTemp wrapper: %v", err)
	}
}
