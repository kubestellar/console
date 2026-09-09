package settings

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

// The seven tests below target uncovered nil-`sm.settings` and empty-import
// branches in manager.go that are not exercised by any existing test. All are
// reachable safely from single-process unit tests by constructing a
// SettingsManager whose key has been loaded (via ensureKeyLoadedLocked) but
// whose settings field has never been populated by Load().
//
// This raises pkg/settings coverage without touching production code. Each
// test is small and asserts observable behavior (default values propagate to
// callers), not implementation details.

// newBareManagerWithKey builds a SettingsManager pointing at a temp dir with
// its encryption key loaded but sm.settings == nil (Load has not run).
func newBareManagerWithKey(t *testing.T) *SettingsManager {
	t.Helper()
	dir := t.TempDir()
	sm := &SettingsManager{
		settingsPath: filepath.Join(dir, settingsFileName),
		keyPath:      filepath.Join(dir, keyFileName),
	}
	key, err := ensureKeyFile(sm.keyPath)
	if err != nil {
		t.Fatalf("ensureKeyFile: %v", err)
	}
	sm.key = key
	return sm
}

// TestGetAll_NilSettings_ReturnsDefaults covers manager.go:293 —
// `if sm.settings == nil { return DefaultAllSettings(), nil }`.
func TestGetAll_NilSettings_ReturnsDefaults(t *testing.T) {
	sm := newBareManagerWithKey(t)
	if sm.settings != nil {
		t.Fatal("precondition: sm.settings should be nil")
	}
	got, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll error: %v", err)
	}
	want := DefaultAllSettings()
	if got.AIMode != want.AIMode {
		t.Errorf("AIMode = %q, want %q (default)", got.AIMode, want.AIMode)
	}
	if got.Theme != want.Theme {
		t.Errorf("Theme = %q, want %q (default)", got.Theme, want.Theme)
	}
}

// TestSaveAll_NilSettings_UsesDefaults covers manager.go:384 —
// SaveAll instantiates DefaultSettings when sm.settings is nil, then persists.
func TestSaveAll_NilSettings_UsesDefaults(t *testing.T) {
	sm := newBareManagerWithKey(t)
	if sm.settings != nil {
		t.Fatal("precondition: sm.settings should be nil")
	}
	all := DefaultAllSettings()
	all.Theme = "batman"
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll: %v", err)
	}
	if sm.settings == nil {
		t.Fatal("SaveAll must populate sm.settings")
	}
	if sm.settings.Settings.Theme != "batman" {
		t.Errorf("Theme = %q, want %q", sm.settings.Settings.Theme, "batman")
	}
}

// TestMigrateFromConfigYaml_NilSettings_UsesDefaults covers manager.go:467 —
// MigrateFromConfigYaml auto-initializes DefaultSettings on a bare manager.
// Also covers L491 (return nil when the provider yields no keys).
func TestMigrateFromConfigYaml_NilSettings_UsesDefaults(t *testing.T) {
	sm := newBareManagerWithKey(t)
	if sm.settings != nil {
		t.Fatal("precondition: sm.settings should be nil")
	}
	empty := &mockConfigProvider{
		apiKeys: map[string]string{},
		envKeys: map[string]bool{},
		models:  map[string]string{},
	}
	if err := sm.MigrateFromConfigYaml(empty); err != nil {
		t.Fatalf("MigrateFromConfigYaml: %v", err)
	}
	if sm.settings == nil {
		t.Fatal("MigrateFromConfigYaml must populate sm.settings")
	}
	if sm.settings.Encrypted.APIKeys != nil {
		t.Error("APIKeys should remain nil when provider is empty")
	}
}

// TestMigrateFromConfigYaml_NilProvider_ReturnsError covers the guard at the
// top of MigrateFromConfigYaml — a nil ConfigProvider is a programming error
// and must be rejected without mutating state.
func TestMigrateFromConfigYaml_NilProvider_ReturnsError(t *testing.T) {
	sm := newTestManager(t)
	err := sm.MigrateFromConfigYaml(nil)
	if err == nil {
		t.Fatal("expected error for nil ConfigProvider")
	}
	if !strings.Contains(err.Error(), "must not be nil") {
		t.Errorf("error = %q, want it to mention 'must not be nil'", err.Error())
	}
}

// TestExportEncrypted_NilSettings_ExportsDefaults covers manager.go:537 —
// ExportEncrypted marshals DefaultSettings when sm.settings is nil so a caller
// exporting from a bare manager still produces a valid JSON document.
func TestExportEncrypted_NilSettings_ExportsDefaults(t *testing.T) {
	sm := newBareManagerWithKey(t)
	if sm.settings != nil {
		t.Fatal("precondition: sm.settings should be nil")
	}
	data, err := sm.ExportEncrypted()
	if err != nil {
		t.Fatalf("ExportEncrypted: %v", err)
	}
	var decoded SettingsFile
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("exported JSON does not decode: %v", err)
	}
	defaults := DefaultSettings()
	if decoded.Settings.AIMode != defaults.Settings.AIMode {
		t.Errorf("AIMode = %q, want %q (default)", decoded.Settings.AIMode, defaults.Settings.AIMode)
	}
	if decoded.Settings.Theme != defaults.Settings.Theme {
		t.Errorf("Theme = %q, want %q (default)", decoded.Settings.Theme, defaults.Settings.Theme)
	}
}

// TestImportEncrypted_NilSettings_InitializesDefaults covers manager.go:560 —
// the `if sm.settings == nil { sm.settings = DefaultSettings() }` branch
// inside ImportEncrypted. Reachable when the caller imports before any Load.
func TestImportEncrypted_NilSettings_InitializesDefaults(t *testing.T) {
	sm := newBareManagerWithKey(t)
	if sm.settings != nil {
		t.Fatal("precondition: sm.settings should be nil")
	}
	imported := SettingsFile{
		Version: 1,
	}
	imported.Settings.AIMode = "high"
	imported.Settings.Theme = "batman"
	imported.Settings.Widget.SelectedWidget = "network-overview"
	payload, err := json.Marshal(imported)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := sm.ImportEncrypted(payload); err != nil {
		t.Fatalf("ImportEncrypted: %v", err)
	}
	if sm.settings == nil {
		t.Fatal("ImportEncrypted must populate sm.settings")
	}
	if sm.settings.Settings.AIMode != "high" {
		t.Errorf("AIMode = %q, want %q", sm.settings.Settings.AIMode, "high")
	}
	if sm.settings.Settings.Theme != "batman" {
		t.Errorf("Theme = %q, want %q", sm.settings.Settings.Theme, "batman")
	}
}

// TestImportEncrypted_EmptyTheme_FillsDefault covers manager.go:572 —
// when the imported payload leaves Theme blank, ImportEncrypted must fill it
// from DefaultSettings rather than persist an empty string that later breaks
// the UI theme selector.
func TestImportEncrypted_EmptyTheme_FillsDefault(t *testing.T) {
	sm := newTestManager(t)
	imported := SettingsFile{
		Version: 1,
	}
	// Populate AIMode + Widget so only Theme is blank.
	imported.Settings.AIMode = "medium"
	imported.Settings.Widget.SelectedWidget = "network-overview"
	// Theme intentionally left as "".
	payload, err := json.Marshal(imported)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := sm.ImportEncrypted(payload); err != nil {
		t.Fatalf("ImportEncrypted: %v", err)
	}
	defaults := DefaultSettings()
	if sm.settings.Settings.Theme != defaults.Settings.Theme {
		t.Errorf("Theme = %q, want %q (default)", sm.settings.Settings.Theme, defaults.Settings.Theme)
	}
}
