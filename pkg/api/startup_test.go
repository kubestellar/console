package api

import (
	"encoding/hex"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFileExists(t *testing.T) {
	// Existing regular file
	tmpFile := filepath.Join(t.TempDir(), "exists.txt")
	if err := os.WriteFile(tmpFile, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !fileExists(tmpFile) {
		t.Error("fileExists should return true for existing regular file")
	}

	// Non-existent path
	if fileExists(filepath.Join(t.TempDir(), "nope.txt")) {
		t.Error("fileExists should return false for non-existent path")
	}

	// Directory (not a file)
	dir := t.TempDir()
	if fileExists(dir) {
		t.Error("fileExists should return false for directories")
	}
}

func TestWaitForPortRelease_AlreadyFree(t *testing.T) {
	// Pick a port that is not in use
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close() // free immediately

	if err := waitForPortRelease(port, 500*time.Millisecond); err != nil {
		t.Errorf("waitForPortRelease should succeed for free port: %v", err)
	}
}

func TestWaitForPortRelease_Timeout(t *testing.T) {
	// Hold a port busy
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port

	err = waitForPortRelease(port, 100*time.Millisecond)
	if err == nil {
		t.Error("waitForPortRelease should return error when port is busy")
	}
}

func TestGenerateRandomSecret(t *testing.T) {
	secret := generateRandomSecret()

	// Must be hex-encoded 32 bytes = 64 hex chars
	if len(secret) != devSecretBytes*2 {
		t.Errorf("expected %d hex chars, got %d", devSecretBytes*2, len(secret))
	}

	// Must be valid hex
	if _, err := hex.DecodeString(secret); err != nil {
		t.Errorf("secret is not valid hex: %v", err)
	}

	// Two calls must produce different results (non-deterministic)
	secret2 := generateRandomSecret()
	if secret == secret2 {
		t.Error("two calls to generateRandomSecret should produce different results")
	}
}

func TestDetectInstallMethod(t *testing.T) {
	tests := []struct {
		name      string
		inCluster bool
		want      string
	}{
		{"in-cluster returns helm", true, "helm"},
		// When not in-cluster and go.mod exists (which it does in this repo)
		{"dev with go.mod", false, "dev"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := detectInstallMethod(tt.inCluster)
			if got != tt.want {
				t.Errorf("detectInstallMethod(%v) = %q, want %q", tt.inCluster, got, tt.want)
			}
		})
	}
}

func TestDetectInstallMethod_Binary(t *testing.T) {
	// Change to a temp dir without go.mod to simulate binary install
	orig, _ := os.Getwd()
	tmp := t.TempDir()
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(orig)

	got := detectInstallMethod(false)
	if got != "binary" {
		t.Errorf("detectInstallMethod(false) in dir without go.mod = %q, want %q", got, "binary")
	}
}

func TestLoadOrCreateDevSecret(t *testing.T) {
	// Override config dir to isolate test
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

	// First call should generate and persist
	secret := loadOrCreateDevSecret()
	if len(secret) < devSecretBytes*2 {
		t.Errorf("secret too short: %d chars", len(secret))
	}

	// Second call should load the persisted secret
	secret2 := loadOrCreateDevSecret()
	if secret2 != secret {
		t.Error("second call should return same persisted secret")
	}
}

func TestSharedSecretPath(t *testing.T) {
	path := sharedSecretPath()
	// Should end with devSecretFile
	if path != "" && filepath.Base(path) != devSecretFile {
		t.Errorf("sharedSecretPath() = %q, expected base %q", path, devSecretFile)
	}
}

func TestGitFallbackRevision(t *testing.T) {
	rev := gitFallbackRevision()
	// In a git repo this should return a 40-char hex SHA; in CI it may be empty
	if rev != "" && len(rev) != 40 {
		t.Errorf("gitFallbackRevision() = %q (len %d), expected 40-char SHA or empty", rev, len(rev))
	}
}

func TestGitFallbackTime(t *testing.T) {
	ts := gitFallbackTime()
	// Should be empty or ISO 8601 format
	if ts != "" {
		if _, err := time.Parse(time.RFC3339, ts); err != nil {
			t.Errorf("gitFallbackTime() = %q, not valid RFC3339: %v", ts, err)
		}
	}
}
