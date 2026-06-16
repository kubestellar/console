package kube

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestIsExecutableTool_Nil(t *testing.T) {
	if isExecutableTool(nil) {
		t.Error("expected false for nil FileInfo")
	}
}

func TestIsExecutableTool_Directory(t *testing.T) {
	dir := t.TempDir()
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if isExecutableTool(info) {
		t.Error("expected false for directory")
	}
}

func TestIsExecutableTool_ExecutableFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission bits not meaningful on Windows")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "tool")
	if err := os.WriteFile(path, []byte("#!/bin/sh\necho hi"), 0755); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !isExecutableTool(info) {
		t.Error("expected true for executable file")
	}
}

func TestIsExecutableTool_NonExecutableFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("all files are 'executable' on Windows")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "data.txt")
	if err := os.WriteFile(path, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if isExecutableTool(info) {
		t.Error("expected false for non-executable file")
	}
}

func TestDefaultStandardToolCandidates_NonEmpty(t *testing.T) {
	candidates := defaultStandardToolCandidates("kubectl")
	if len(candidates) == 0 {
		t.Error("expected at least one candidate path")
	}

	// Every candidate should contain the tool name
	for _, c := range candidates {
		if !strings.Contains(filepath.Base(c), "kubectl") {
			t.Errorf("candidate %q does not contain tool name 'kubectl'", c)
		}
	}
}

func TestDefaultStandardToolCandidates_NoDuplicates(t *testing.T) {
	candidates := defaultStandardToolCandidates("helm")
	seen := make(map[string]bool)
	for _, c := range candidates {
		if seen[c] {
			t.Errorf("duplicate candidate: %q", c)
		}
		seen[c] = true
	}
}

func TestDefaultStandardToolCandidates_ContainsStandardPaths(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("standard paths differ on Windows")
	}

	candidates := defaultStandardToolCandidates("kubectl")
	hasUsrLocalBin := false
	for _, c := range candidates {
		if strings.HasPrefix(c, "/usr/local/bin/") {
			hasUsrLocalBin = true
			break
		}
	}
	if !hasUsrLocalBin {
		t.Error("expected /usr/local/bin/ in candidate paths on Unix")
	}
}

func TestDefaultStandardToolCandidates_IncludesHomeBin(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("home bin structure differs on Windows")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home directory")
	}

	candidates := defaultStandardToolCandidates("kubectl")
	homeBin := filepath.Join(home, "bin", "kubectl")
	found := false
	for _, c := range candidates {
		if c == homeBin {
			found = true
			break
		}
	}
	// This may not exist but should be in the candidate list
	if !found {
		localBin := filepath.Join(home, ".local", "bin", "kubectl")
		for _, c := range candidates {
			if c == localBin {
				found = true
				break
			}
		}
	}
	if !found {
		t.Error("expected ~/bin/kubectl or ~/.local/bin/kubectl in candidate paths")
	}
}
