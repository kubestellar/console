package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	legacyWatcherPidFileName   = ".kc-watchdog.pid"
	legacyWatcherStageFileName = ".kc-startup-stage"
	victimFileContents         = "sentinel"
)

func TestPrepareWatcherRuntimeCreatesRestrictedPaths(t *testing.T) {
	runtimeInfoFile := filepath.Join(t.TempDir(), "data", "kc-watcher-runtime.env")

	runtimeState, cleanup, err := prepareWatcherRuntime(runtimeInfoFile)
	if err != nil {
		t.Fatalf("prepareWatcherRuntime() error = %v", err)
	}
	t.Cleanup(cleanup)

	assertPathMode(t, runtimeState.Dir, watcherRuntimeDirPerms)
	assertPathMode(t, runtimeState.PidFile, watcherPidFilePerms)
	assertPathMode(t, runtimeState.StageFile, watcherStageFilePerms)
	assertPathMode(t, runtimeInfoFile, watcherRuntimeFilePerms)

	if filepath.Dir(runtimeState.PidFile) != runtimeState.Dir {
		t.Fatalf("pid file %q not created inside runtime dir %q", runtimeState.PidFile, runtimeState.Dir)
	}
	if filepath.Dir(runtimeState.StageFile) != runtimeState.Dir {
		t.Fatalf("stage file %q not created inside runtime dir %q", runtimeState.StageFile, runtimeState.Dir)
	}

	runtimeInfo := mustReadFile(t, runtimeInfoFile)
	for _, want := range []string{
		"WATCHDOG_RUNTIME_DIR=" + runtimeState.Dir,
		"WATCHDOG_PID_FILE=" + runtimeState.PidFile,
		"STAGE_FILE=" + runtimeState.StageFile,
	} {
		if !strings.Contains(runtimeInfo, want) {
			t.Fatalf("runtime info %q missing %q", runtimeInfoFile, want)
		}
	}
}

func TestPrepareWatcherRuntimeUsesUniqueUnpredictableNames(t *testing.T) {
	baseDir := t.TempDir()
	firstRuntimeInfo := filepath.Join(baseDir, "first", "kc-watcher-runtime.env")
	secondRuntimeInfo := filepath.Join(baseDir, "second", "kc-watcher-runtime.env")

	firstState, firstCleanup, err := prepareWatcherRuntime(firstRuntimeInfo)
	if err != nil {
		t.Fatalf("first prepareWatcherRuntime() error = %v", err)
	}
	t.Cleanup(firstCleanup)

	secondState, secondCleanup, err := prepareWatcherRuntime(secondRuntimeInfo)
	if err != nil {
		t.Fatalf("second prepareWatcherRuntime() error = %v", err)
	}
	t.Cleanup(secondCleanup)

	if firstState.Dir == secondState.Dir {
		t.Fatal("prepareWatcherRuntime() reused runtime directory")
	}
	if firstState.PidFile == secondState.PidFile {
		t.Fatal("prepareWatcherRuntime() reused pid file path")
	}
	if firstState.StageFile == secondState.StageFile {
		t.Fatal("prepareWatcherRuntime() reused stage file path")
	}

	assertRandomizedName(t, firstState.Dir, "kc-watcher-", "")
	assertRandomizedName(t, firstState.PidFile, "watchdog-", ".pid")
	assertRandomizedName(t, firstState.StageFile, "startup-stage-", ".tmp")

	if filepath.Base(firstState.PidFile) == legacyWatcherPidFileName {
		t.Fatalf("pid file reused legacy predictable name %q", legacyWatcherPidFileName)
	}
	if filepath.Base(firstState.StageFile) == legacyWatcherStageFileName {
		t.Fatalf("stage file reused legacy predictable name %q", legacyWatcherStageFileName)
	}
}

func TestWriteWatcherRuntimeInfoReplacesSymlinkInsteadOfFollowingIt(t *testing.T) {
	baseDir := t.TempDir()
	victimFile := filepath.Join(baseDir, "victim.txt")
	if err := os.WriteFile(victimFile, []byte(victimFileContents), watcherRuntimeFilePerms); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", victimFile, err)
	}

	runtimeInfoFile := filepath.Join(baseDir, "data", "kc-watcher-runtime.env")
	if err := os.MkdirAll(filepath.Dir(runtimeInfoFile), watcherRuntimeDirPerms); err != nil {
		t.Fatalf("MkdirAll(%q) error = %v", filepath.Dir(runtimeInfoFile), err)
	}
	if err := os.Symlink(victimFile, runtimeInfoFile); err != nil {
		t.Fatalf("Symlink(%q, %q) error = %v", victimFile, runtimeInfoFile, err)
	}

	runtimeState := WatcherRuntimeState{
		Dir:       filepath.Join(baseDir, "runtime"),
		PidFile:   filepath.Join(baseDir, "watchdog.pid"),
		StageFile: filepath.Join(baseDir, "startup-stage.tmp"),
	}
	if err := writeWatcherRuntimeInfo(runtimeInfoFile, runtimeState); err != nil {
		t.Fatalf("writeWatcherRuntimeInfo() error = %v", err)
	}

	if got := mustReadFile(t, victimFile); got != victimFileContents {
		t.Fatalf("victim file changed through symlink: got %q want %q", got, victimFileContents)
	}
	if info, err := os.Lstat(runtimeInfoFile); err != nil {
		t.Fatalf("Lstat(%q) error = %v", runtimeInfoFile, err)
	} else if info.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("runtime info file %q remained a symlink", runtimeInfoFile)
	}

	runtimeInfo := mustReadFile(t, runtimeInfoFile)
	if !strings.Contains(runtimeInfo, "WATCHDOG_RUNTIME_DIR="+runtimeState.Dir) {
		t.Fatalf("runtime info %q missing runtime dir entry", runtimeInfoFile)
	}
}

func assertPathMode(t *testing.T, path string, want os.FileMode) {
	t.Helper()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", path, err)
	}
	if got := info.Mode().Perm(); got != want {
		t.Fatalf("path %q mode = %o, want %o", path, got, want)
	}
}

func assertRandomizedName(t *testing.T, path, prefix, suffix string) {
	t.Helper()

	name := filepath.Base(path)
	if !strings.HasPrefix(name, prefix) {
		t.Fatalf("path %q does not start with %q", path, prefix)
	}
	if suffix != "" && !strings.HasSuffix(name, suffix) {
		t.Fatalf("path %q does not end with %q", path, suffix)
	}
	if trimmed := strings.TrimSuffix(strings.TrimPrefix(name, prefix), suffix); trimmed == "" {
		t.Fatalf("path %q did not include a randomized suffix", path)
	}
}

func mustReadFile(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	return string(data)
}
