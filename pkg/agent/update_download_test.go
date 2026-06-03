package agent

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func createTestTarGz(t *testing.T, entries []struct {
	Name     string
	Content  string
	Typeflag byte
	Linkname string
}) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "test-*.tar.gz")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	gw := gzip.NewWriter(f)
	tw := tar.NewWriter(gw)

	for _, e := range entries {
		typeflag := e.Typeflag
		if typeflag == 0 {
			typeflag = tar.TypeReg
		}
		hdr := &tar.Header{
			Name:     e.Name,
			Mode:     0644,
			Size:     int64(len(e.Content)),
			Typeflag: typeflag,
			Linkname: e.Linkname,
		}
		if typeflag == tar.TypeDir {
			hdr.Size = 0
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if typeflag == tar.TypeReg && len(e.Content) > 0 {
			if _, err := tw.Write([]byte(e.Content)); err != nil {
				t.Fatal(err)
			}
		}
	}

	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gw.Close(); err != nil {
		t.Fatal(err)
	}
	return f.Name()
}

func TestSafeTarExtract_ValidArchive(t *testing.T) {
	archive := createTestTarGz(t, []struct {
		Name     string
		Content  string
		Typeflag byte
		Linkname string
	}{
		{Name: "console", Content: "binary-content", Typeflag: tar.TypeReg},
		{Name: "subdir/", Typeflag: tar.TypeDir},
		{Name: "subdir/config.yaml", Content: "key: value", Typeflag: tar.TypeReg},
	})

	destDir := t.TempDir()
	err := safeTarExtract(context.Background(), archive, destDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify files were extracted
	content, err := os.ReadFile(filepath.Join(destDir, "console"))
	if err != nil {
		t.Fatalf("failed to read extracted file: %v", err)
	}
	if string(content) != "binary-content" {
		t.Errorf("unexpected content: %s", content)
	}

	content, err = os.ReadFile(filepath.Join(destDir, "subdir", "config.yaml"))
	if err != nil {
		t.Fatalf("failed to read extracted subdir file: %v", err)
	}
	if string(content) != "key: value" {
		t.Errorf("unexpected content: %s", content)
	}
}

func TestSafeTarExtract_PathTraversal(t *testing.T) {
	tests := []struct {
		name    string
		entries []struct {
			Name     string
			Content  string
			Typeflag byte
			Linkname string
		}
	}{
		{
			name: "dot-dot traversal",
			entries: []struct {
				Name     string
				Content  string
				Typeflag byte
				Linkname string
			}{
				{Name: "../etc/passwd", Content: "malicious", Typeflag: tar.TypeReg},
			},
		},
		{
			name: "absolute path",
			entries: []struct {
				Name     string
				Content  string
				Typeflag byte
				Linkname string
			}{
				{Name: "/etc/passwd", Content: "malicious", Typeflag: tar.TypeReg},
			},
		},
		{
			name: "nested traversal",
			entries: []struct {
				Name     string
				Content  string
				Typeflag byte
				Linkname string
			}{
				{Name: "foo/../../etc/passwd", Content: "malicious", Typeflag: tar.TypeReg},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			archive := createTestTarGz(t, tc.entries)
			destDir := t.TempDir()
			err := safeTarExtract(context.Background(), archive, destDir)
			if err == nil {
				t.Fatal("expected error for path traversal, got nil")
			}
		})
	}
}

func TestSafeTarExtract_SymlinkRejected(t *testing.T) {
	archive := createTestTarGz(t, []struct {
		Name     string
		Content  string
		Typeflag byte
		Linkname string
	}{
		{Name: "evil-link", Typeflag: tar.TypeSymlink, Linkname: "/etc/passwd"},
	})

	destDir := t.TempDir()
	err := safeTarExtract(context.Background(), archive, destDir)
	if err == nil {
		t.Fatal("expected error for symlink, got nil")
	}
}

func TestSafeTarExtract_ContextCancellation(t *testing.T) {
	archive := createTestTarGz(t, []struct {
		Name     string
		Content  string
		Typeflag byte
		Linkname string
	}{
		{Name: "file1", Content: "data", Typeflag: tar.TypeReg},
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	destDir := t.TempDir()
	err := safeTarExtract(ctx, archive, destDir)
	if err == nil {
		t.Fatal("expected context cancellation error, got nil")
	}
}
