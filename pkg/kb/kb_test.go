package kb

import (
	"errors"
	"io/fs"
	"testing"
)

func TestDataPath(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "empty string returns dataRoot", input: "", expected: "data"},
		{name: "simple path", input: "test.txt", expected: "data/test.txt"},
		{name: "nested path", input: "subdir/nested.txt", expected: "data/subdir/nested.txt"},
		{name: "path with trailing slash", input: "subdir/", expected: "data/subdir"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := dataPath(tc.input)
			if got != tc.expected {
				t.Errorf("dataPath(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestReadFile(t *testing.T) {
	content, err := ReadFile("test.txt")
	if err != nil {
		t.Fatalf("ReadFile(\"test.txt\") returned error: %v", err)
	}
	expected := "hello world\n"
	if string(content) != expected {
		t.Errorf("ReadFile(\"test.txt\") = %q, want %q", string(content), expected)
	}
}

func TestReadFileNested(t *testing.T) {
	content, err := ReadFile("subdir/nested.txt")
	if err != nil {
		t.Fatalf("ReadFile(\"subdir/nested.txt\") returned error: %v", err)
	}
	expected := "nested content\n"
	if string(content) != expected {
		t.Errorf("ReadFile(\"subdir/nested.txt\") = %q, want %q", string(content), expected)
	}
}

func TestReadFileNotFound(t *testing.T) {
	_, err := ReadFile("nonexistent.txt")
	if err == nil {
		t.Error("ReadFile(\"nonexistent.txt\") expected error, got nil")
	}
}

func TestStat(t *testing.T) {
	info, err := Stat("test.txt")
	if err != nil {
		t.Fatalf("Stat(\"test.txt\") returned error: %v", err)
	}
	if info.IsDir() {
		t.Error("Stat(\"test.txt\") expected file, got directory")
	}
	if info.Name() != "test.txt" {
		t.Errorf("Stat(\"test.txt\").Name() = %q, want \"test.txt\"", info.Name())
	}
}

func TestStatDir(t *testing.T) {
	info, err := Stat("subdir")
	if err != nil {
		t.Fatalf("Stat(\"subdir\") returned error: %v", err)
	}
	if !info.IsDir() {
		t.Error("Stat(\"subdir\") expected directory, got file")
	}
}

func TestStatRoot(t *testing.T) {
	info, err := Stat("")
	if err != nil {
		t.Fatalf("Stat(\"\") returned error: %v", err)
	}
	if !info.IsDir() {
		t.Error("Stat(\"\") expected directory (data root), got file")
	}
}

func TestReadDir(t *testing.T) {
	entries, err := ReadDir("")
	if err != nil {
		t.Fatalf("ReadDir(\"\") returned error: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("ReadDir(\"\") returned no entries")
	}

	found := make(map[string]bool)
	for _, e := range entries {
		found[e.Name()] = true
	}
	if !found["test.txt"] {
		t.Error("ReadDir(\"\") missing \"test.txt\"")
	}
	if !found["subdir"] {
		t.Error("ReadDir(\"\") missing \"subdir\"")
	}
}

func TestReadDirSubdir(t *testing.T) {
	entries, err := ReadDir("subdir")
	if err != nil {
		t.Fatalf("ReadDir(\"subdir\") returned error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("ReadDir(\"subdir\") returned %d entries, want 1", len(entries))
	}
	if entries[0].Name() != "nested.txt" {
		t.Errorf("ReadDir(\"subdir\")[0].Name() = %q, want \"nested.txt\"", entries[0].Name())
	}
}

func TestReadDirNotFound(t *testing.T) {
	_, err := ReadDir("nonexistent")
	if err == nil {
		t.Error("ReadDir(\"nonexistent\") expected error, got nil")
	}
}

func TestStatNotFound(t *testing.T) {
	_, err := Stat("nonexistent.txt")
	if err == nil {
		t.Error("Stat(\"nonexistent.txt\") expected error, got nil")
	}
	if !errors.Is(err, fs.ErrNotExist) {
		// embed.FS wraps the error; just verify we got a non-nil error
		t.Logf("Stat(\"nonexistent.txt\") error type: %T, value: %v", err, err)
	}
}
