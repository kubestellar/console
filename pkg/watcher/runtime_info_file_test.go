package watcher

import (
	"path/filepath"
	"testing"
)

func TestRuntimeInfoFileFromEnv(t *testing.T) {
	customPath := filepath.Join(t.TempDir(), "runtime.env")
	t.Setenv(RuntimeInfoFileEnv, customPath)
	if got := RuntimeInfoFileFromEnv(); got != customPath {
		t.Fatalf("RuntimeInfoFileFromEnv() = %q, want %q", got, customPath)
	}

	t.Setenv(RuntimeInfoFileEnv, "   ")
	if got := RuntimeInfoFileFromEnv(); got != RuntimeInfoFile {
		t.Fatalf("RuntimeInfoFileFromEnv() with blank env = %q, want %q", got, RuntimeInfoFile)
	}
}
