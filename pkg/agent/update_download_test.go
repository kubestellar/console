package agent

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

type tarArchiveEntry struct {
	name     string
	typeflag byte
	body     string
	linkName string
	mode     int64
}

func writeTarGzArchive(t *testing.T, archivePath string, entries []tarArchiveEntry) {
	t.Helper()

	archiveFile, err := os.Create(archivePath)
	require.NoError(t, err)
	defer archiveFile.Close()

	gzipWriter := gzip.NewWriter(archiveFile)
	defer gzipWriter.Close()

	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	for _, entry := range entries {
		header := &tar.Header{
			Name:     entry.name,
			Typeflag: entry.typeflag,
			Mode:     entry.mode,
			Linkname: entry.linkName,
		}
		if entry.typeflag == tar.TypeReg || entry.typeflag == tar.TypeRegA {
			header.Size = int64(len(entry.body))
		}

		require.NoError(t, tarWriter.WriteHeader(header))
		if entry.typeflag == tar.TypeReg || entry.typeflag == tar.TypeRegA {
			_, err = tarWriter.Write([]byte(entry.body))
			require.NoError(t, err)
		}
	}
}

func TestExtractTarGz(t *testing.T) {
	t.Run("extracts regular files", func(t *testing.T) {
		baseDir := t.TempDir()
		archivePath := filepath.Join(baseDir, "update.tar.gz")
		destDir := filepath.Join(baseDir, "staging")
		require.NoError(t, os.MkdirAll(destDir, 0o755))

		writeTarGzArchive(t, archivePath, []tarArchiveEntry{
			{name: "console", typeflag: tar.TypeReg, body: "new-binary", mode: 0o755},
		})

		require.NoError(t, extractTarGz(context.Background(), archivePath, destDir))

		content, err := os.ReadFile(filepath.Join(destDir, "console"))
		require.NoError(t, err)
		require.Equal(t, "new-binary", string(content))
	})

	t.Run("rejects parent traversal paths", func(t *testing.T) {
		baseDir := t.TempDir()
		archivePath := filepath.Join(baseDir, "update.tar.gz")
		destDir := filepath.Join(baseDir, "staging")
		require.NoError(t, os.MkdirAll(destDir, 0o755))

		writeTarGzArchive(t, archivePath, []tarArchiveEntry{
			{name: "../escape", typeflag: tar.TypeReg, body: "bad", mode: 0o644},
		})

		err := extractTarGz(context.Background(), archivePath, destDir)
		require.ErrorContains(t, err, "invalid archive path")
		_, statErr := os.Stat(filepath.Join(baseDir, "escape"))
		require.True(t, os.IsNotExist(statErr))
	})

	t.Run("rejects absolute paths", func(t *testing.T) {
		baseDir := t.TempDir()
		archivePath := filepath.Join(baseDir, "update.tar.gz")
		destDir := filepath.Join(baseDir, "staging")
		require.NoError(t, os.MkdirAll(destDir, 0o755))

		writeTarGzArchive(t, archivePath, []tarArchiveEntry{
			{name: "/escape", typeflag: tar.TypeReg, body: "bad", mode: 0o644},
		})

		err := extractTarGz(context.Background(), archivePath, destDir)
		require.ErrorContains(t, err, "absolute paths are not allowed")
	})

	t.Run("rejects symlinks that escape the staging directory", func(t *testing.T) {
		baseDir := t.TempDir()
		archivePath := filepath.Join(baseDir, "update.tar.gz")
		destDir := filepath.Join(baseDir, "staging")
		require.NoError(t, os.MkdirAll(destDir, 0o755))

		writeTarGzArchive(t, archivePath, []tarArchiveEntry{
			{name: "console", typeflag: tar.TypeReg, body: "new-binary", mode: 0o755},
			{name: "console-link", typeflag: tar.TypeSymlink, linkName: "../escape", mode: 0o777},
		})

		err := extractTarGz(context.Background(), archivePath, destDir)
		require.ErrorContains(t, err, "invalid symlink target")
		_, statErr := os.Lstat(filepath.Join(destDir, "console-link"))
		require.True(t, os.IsNotExist(statErr))
	})

	t.Run("rejects hard links that escape the staging directory", func(t *testing.T) {
		baseDir := t.TempDir()
		archivePath := filepath.Join(baseDir, "update.tar.gz")
		destDir := filepath.Join(baseDir, "staging")
		require.NoError(t, os.MkdirAll(destDir, 0o755))

		writeTarGzArchive(t, archivePath, []tarArchiveEntry{
			{name: "console", typeflag: tar.TypeReg, body: "new-binary", mode: 0o755},
			{name: "console-link", typeflag: tar.TypeLink, linkName: "../escape", mode: 0o755},
		})

		err := extractTarGz(context.Background(), archivePath, destDir)
		require.ErrorContains(t, err, "invalid hard link target")
		_, statErr := os.Lstat(filepath.Join(destDir, "console-link"))
		require.True(t, os.IsNotExist(statErr))
	})

	t.Run("honors cancelled contexts", func(t *testing.T) {
		baseDir := t.TempDir()
		archivePath := filepath.Join(baseDir, "update.tar.gz")
		destDir := filepath.Join(baseDir, "staging")
		require.NoError(t, os.MkdirAll(destDir, 0o755))

		writeTarGzArchive(t, archivePath, []tarArchiveEntry{{name: "console", typeflag: tar.TypeReg, body: string(bytes.Repeat([]byte("a"), archiveCopyBufferBytes*2)), mode: 0o755}})

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		err := extractTarGz(ctx, archivePath, destDir)
		require.ErrorIs(t, err, context.Canceled)
	})
}
