package settings

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestSaveLocked_PendingLoadErrorBlocksWrite covers the
// pendingLoadErrorLocked() error branch in saveLocked(): when sm.loadErr is
// non-nil (e.g. Load() previously failed to back up a corrupt settings file),
// saveLocked must refuse to write and surface the "refusing to overwrite
// settings after backup failure" wrapper.
func TestSaveLocked_PendingLoadErrorBlocksWrite(t *testing.T) {
	sm := newTestManager(t)
	sentinel := errors.New("simulated corrupt-backup failure")

	sm.mu.Lock()
	sm.loadErr = sentinel
	sm.mu.Unlock()

	err := sm.Save()
	if err == nil {
		t.Fatalf("Save() returned nil, want error wrapping loadErr")
	}
	if !errors.Is(err, sentinel) {
		t.Errorf("Save() error does not wrap loadErr: %v", err)
	}
	if !strings.Contains(err.Error(), "refusing to overwrite settings after backup failure") {
		t.Errorf("Save() error missing sentinel wrapper text: %v", err)
	}
}

// TestSaveLocked_NilSettingsGetsDefaults covers the `sm.settings == nil`
// fallback branch: saveLocked() must synthesize DefaultSettings() rather than
// dereference nil and then persist a valid file.
func TestSaveLocked_NilSettingsGetsDefaults(t *testing.T) {
	sm := newTestManager(t)

	sm.mu.Lock()
	sm.settings = nil
	sm.mu.Unlock()

	if err := sm.Save(); err != nil {
		t.Fatalf("Save() with nil settings failed: %v", err)
	}

	sm.mu.RLock()
	got := sm.settings
	sm.mu.RUnlock()

	if got == nil {
		t.Fatalf("expected saveLocked to backfill DefaultSettings(), still nil")
	}
	def := DefaultSettings()
	if got.Version != def.Version {
		t.Errorf("Version = %d, want %d (DefaultSettings)", got.Version, def.Version)
	}
	if got.Settings.AIMode != def.Settings.AIMode {
		t.Errorf("AIMode = %q, want %q (DefaultSettings)", got.Settings.AIMode, def.Settings.AIMode)
	}
	if got.LastModified == "" {
		t.Errorf("expected LastModified to be set after Save()")
	}

	// File must exist on disk with the defaults inside.
	data, err := os.ReadFile(sm.settingsPath)
	if err != nil {
		t.Fatalf("settings file not written: %v", err)
	}
	if !strings.Contains(string(data), `"aiMode": "medium"`) {
		t.Errorf("settings file does not contain default aiMode:\n%s", data)
	}
}

// TestSaveLocked_MkdirAllFailsWhenParentIsFile covers the
// os.MkdirAll error branch: if a *file* already sits at the settings
// directory path, MkdirAll returns ENOTDIR and saveLocked must surface a
// wrapped "failed to create settings directory" error.
func TestSaveLocked_MkdirAllFailsWhenParentIsFile(t *testing.T) {
	dir := t.TempDir()

	// Place a plain file where the settings directory should be.
	blockedDir := filepath.Join(dir, "blocked")
	if err := os.WriteFile(blockedDir, []byte("i am not a directory"), 0o600); err != nil {
		t.Fatalf("failed to seed blocking file: %v", err)
	}

	sm := &SettingsManager{
		settingsPath: filepath.Join(blockedDir, settingsFileName),
		keyPath:      filepath.Join(dir, keyFileName),
		settings:     DefaultSettings(),
	}

	err := sm.Save()
	if err == nil {
		t.Fatalf("Save() returned nil, want MkdirAll failure")
	}
	if !strings.Contains(err.Error(), "failed to create settings directory") {
		t.Errorf("Save() error missing MkdirAll wrapper: %v", err)
	}
}

// TestSaveLocked_RenameFailsWhenTargetIsDirectory covers the os.Rename error
// branch: if a directory sits at settingsPath (where the temp file is
// supposed to be renamed to), the atomic rename fails and saveLocked must
// surface a wrapped "failed to rename temp settings file" error.
//
// This also indirectly verifies that the temp file was successfully created,
// written, chmoded, synced, and closed — the pipeline made it all the way to
// the rename step before failing, so those earlier steps are exercised too.
func TestSaveLocked_RenameFailsWhenTargetIsDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("directory-as-file rename semantics differ on Windows")
	}
	dir := t.TempDir()

	// Create a directory where the settings file would land — os.Rename of
	// a regular file over a non-empty directory fails with ENOTDIR/EISDIR
	// on Linux.
	targetDir := filepath.Join(dir, settingsFileName)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		t.Fatalf("failed to seed blocking dir: %v", err)
	}
	// Put a file inside so the target is non-empty (rename of file over
	// empty directory sometimes succeeds; over non-empty it always fails).
	if err := os.WriteFile(filepath.Join(targetDir, "sentinel"), []byte("x"), 0o600); err != nil {
		t.Fatalf("failed to seed sentinel: %v", err)
	}

	sm := &SettingsManager{
		settingsPath: targetDir,
		keyPath:      filepath.Join(dir, keyFileName),
		settings:     DefaultSettings(),
	}

	err := sm.Save()
	if err == nil {
		t.Fatalf("Save() returned nil, want Rename failure")
	}
	if !strings.Contains(err.Error(), "failed to rename temp settings file") {
		t.Errorf("Save() error missing Rename wrapper: %v", err)
	}
	// The temp file must have been cleaned up: no leftover .settings-*.tmp
	// files should remain in the settings directory.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir failed: %v", err)
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".settings-") && strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("temp file %q was not cleaned up after Rename failure", e.Name())
		}
	}
}
