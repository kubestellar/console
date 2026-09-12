package updater

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"testing"
)

// buildValidTarGz returns the bytes of a minimal, valid .tar.gz that
// contains one regular file (entryName, entryBody). Used by test files
// that need executeBinaryUpdateFlow to pass safeTarExtract cleanly so a
// later branch (backup, chmod, rename, restart, or cancellation) can be
// exercised without depending on any host binary or filesystem quirk.
func buildValidTarGz(t *testing.T, entryName string, entryBody []byte) []byte {
	t.Helper()

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)

	hdr := &tar.Header{
		Name: entryName,
		Mode: 0o755,
		Size: int64(len(entryBody)),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatalf("buildValidTarGz: WriteHeader %q: %v", entryName, err)
	}
	if _, err := tw.Write(entryBody); err != nil {
		t.Fatalf("buildValidTarGz: Write %q: %v", entryName, err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("buildValidTarGz: tar Close: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("buildValidTarGz: gzip Close: %v", err)
	}
	return buf.Bytes()
}
