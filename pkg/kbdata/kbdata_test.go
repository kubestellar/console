package kbdata

import (
	"io/fs"
	"testing"
)

func TestReadFile(t *testing.T) {
	// The embedded_kb directory should contain fixes/index.json
	data, err := ReadFile("fixes/index.json")
	if err != nil {
		t.Fatalf("ReadFile(fixes/index.json) error: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("ReadFile(fixes/index.json) returned empty data")
	}
}

func TestReadFileNotFound(t *testing.T) {
	_, err := ReadFile("nonexistent.json")
	if err == nil {
		t.Fatal("ReadFile(nonexistent.json) expected error, got nil")
	}
}

func TestStat(t *testing.T) {
	info, err := Stat("fixes")
	if err != nil {
		t.Fatalf("Stat(fixes) error: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("Stat(fixes) expected directory")
	}
}

func TestReadDir(t *testing.T) {
	entries, err := ReadDir("fixes")
	if err != nil {
		t.Fatalf("ReadDir(fixes) error: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("ReadDir(fixes) returned no entries")
	}
}

func TestFS(t *testing.T) {
	fsys := FS()
	_, err := fs.Stat(fsys, "fixes")
	if err != nil {
		t.Fatalf("FS().Stat(fixes) error: %v", err)
	}
}
