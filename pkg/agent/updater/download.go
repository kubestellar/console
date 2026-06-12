package updater

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// sanitizeTagName strips path separators and parent-directory traversals from a
// GitHub release tag name so it is safe to embed in filesystem paths (#14382).
func sanitizeTagName(tag string) string {
	tag = strings.ReplaceAll(tag, "/", "_")
	tag = strings.ReplaceAll(tag, "\\", "_")
	tag = strings.ReplaceAll(tag, "..", "_")
	if tag == "" {
		tag = "unknown"
	}
	return tag
}

// verifyChecksumFromRelease downloads checksums.txt from a GitHub release and verifies
// the SHA256 hash of a downloaded file against it (CWE-494 mitigation).
// Returns the expected checksum if verification succeeds, or an error if:
// - checksums.txt cannot be downloaded
// - the expected filename is not found in checksums.txt
// - the actual file hash does not match the expected hash
func verifyChecksumFromRelease(release *githubReleaseInfo, fileName, downloadedFilePath string) (string, error) {
	// Find checksums.txt asset in the release
	var checksumsURL string
	for _, a := range release.Assets {
		if a.Name == "checksums.txt" {
			checksumsURL = a.BrowserDownloadURL
			break
		}
	}

	if checksumsURL == "" {
		return "", fmt.Errorf("checksums.txt not found in release %s", release.TagName)
	}

	// Download checksums.txt
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(checksumsURL)
	if err != nil {
		return "", fmt.Errorf("download checksums.txt failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("checksums.txt download returned %d", resp.StatusCode)
	}

	// Parse checksums.txt (format: "sha256hash  filename")
	checksumMap := make(map[string]string)
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		hash, fname, err := parseChecksumLine(scanner.Text())
		if err != nil {
			slog.Warn("[AutoUpdate] skipping invalid checksum line", "line", scanner.Text())
			continue
		}
		checksumMap[fname] = hash
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("parse checksums.txt failed: %w", err)
	}

	// Get expected checksum for our binary
	expectedHash, found := checksumMap[fileName]
	if !found {
		availableKeys := make([]string, 0, len(checksumMap))
		for k := range checksumMap {
			availableKeys = append(availableKeys, k)
		}
		return "", fmt.Errorf("checksum for %s not found in checksums.txt (available: %v)", fileName, availableKeys)
	}

	// Compute SHA256 of downloaded file
	actualHash, err := computeSHA256(downloadedFilePath)
	if err != nil {
		return "", fmt.Errorf("compute SHA256 of downloaded file failed: %w", err)
	}

	// Compare hashes (case-insensitive)
	if strings.EqualFold(actualHash, expectedHash) {
		slog.Info("[AutoUpdate] checksum verified", "file", fileName, "hash", actualHash)
		return expectedHash, nil
	}

	return "", fmt.Errorf("checksum mismatch for %s: expected %s, got %s (CWE-494)", fileName, expectedHash, actualHash)
}

// computeSHA256 computes the SHA256 hash of a file.
func computeSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// parseChecksumLine parses a line from checksums.txt (format: "sha256hash  filename")
// Returns (hash, filename, error).
func parseChecksumLine(line string) (string, string, error) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return "", "", fmt.Errorf("empty or comment line")
	}

	// Split on whitespace (usually "hash  filename" with two spaces)
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid format: %s", line)
	}

	hash := parts[0]
	filename := parts[1]

	// Validate hash is hex and reasonable length (SHA256 = 64 hex chars)
	if len(hash) != 64 || !isHexString(hash) {
		return "", "", fmt.Errorf("invalid hash format: %s", hash)
	}

	return hash, filename, nil
}

// isHexString checks if a string contains only valid hex characters.
func isHexString(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func renameOrCopy(src, dst string) error {
	err := os.Rename(src, dst)
	if err == nil {
		return nil
	}
	// If not a cross-device error, return immediately.
	if !strings.Contains(err.Error(), "cross-device") &&
		!strings.Contains(err.Error(), "invalid cross-device link") {
		return err
	}

	slog.Info("[AutoUpdate] rename failed with EXDEV, falling back to copy", "src", src, "dst", dst)

	in, openErr := os.Open(src)
	if openErr != nil {
		return fmt.Errorf("copy fallback: open source: %w", openErr)
	}
	defer in.Close()

	// copyBinaryMode is the permission bits for the copied binary during update.
	const copyBinaryMode = 0755
	out, createErr := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, copyBinaryMode)
	if createErr != nil {
		return fmt.Errorf("copy fallback: create dest: %w", createErr)
	}

	if _, cpErr := io.Copy(out, in); cpErr != nil {
		out.Close()
		return fmt.Errorf("copy fallback: copy data: %w", cpErr)
	}
	if syncErr := out.Sync(); syncErr != nil {
		out.Close()
		return fmt.Errorf("copy fallback: sync: %w", syncErr)
	}
	if closeErr := out.Close(); closeErr != nil {
		return fmt.Errorf("copy fallback: close: %w", closeErr)
	}

	// Best-effort cleanup of the source file.
	os.Remove(src)
	return nil
}

func (uc *UpdateChecker) executeBinaryUpdateFlow(release *githubReleaseInfo) {
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "pulling",
		Message:  fmt.Sprintf("Downloading %s...", release.TagName),
		Progress: 20,
	})

	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_%s_%s.tar.gz", strings.TrimPrefix(release.TagName, "v"), platform)

	var assetURL string
	for _, a := range release.Assets {
		if a.Name == assetName {
			assetURL = a.BrowserDownloadURL
			break
		}
	}

	if assetURL == "" {
		uc.recordError("no matching asset found for platform " + platform)
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "No download available for your platform",
			Error:   "Asset not found: " + assetName,
		})
		return
	}

	// Download to temp file — use unique temp file for race-free isolation (#14380).
	// Sanitize TagName to prevent path traversal (#14382).
	safeTag := sanitizeTagName(release.TagName)
	tmpF, err := os.CreateTemp(os.TempDir(), fmt.Sprintf("kc-update-%s-*.tar.gz", safeTag))
	if err != nil {
		uc.recordError(fmt.Sprintf("failed to create temp file: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to create temp file",
			Error:   "check server logs for details",
		})
		return
	}
	tmpFile := tmpF.Name()
	tmpF.Close()
	defer os.Remove(tmpFile) // Guaranteed cleanup on all exit paths (#14499)
	if err := downloadFile(assetURL, tmpFile); err != nil {
		uc.recordError(fmt.Sprintf("download failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Download failed",
			Error:   "check server logs for details",
		})
		return
	}

	// Verify checksum after download (CWE-494 mitigation)
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "building",
		Message:  "Verifying integrity...",
		Progress: 35,
	})

	_, err = verifyChecksumFromRelease(release, assetName, tmpFile)
	if err != nil {
		uc.recordError(fmt.Sprintf("checksum verification failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Integrity verification failed",
			Error:   "Binary checksum does not match release artifact - possible tampering or corruption detected",
		})
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "building",
		Message:  "Extracting update...",
		Progress: 50,
	})

	// Extract to staging directory — use os.MkdirTemp for race-free isolation (#14380).
	stagingDir, err := os.MkdirTemp(os.TempDir(), "kc-update-staging-*")
	if err != nil {
		uc.recordError(fmt.Sprintf("failed to create staging dir: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to prepare staging directory",
			Error:   "check server logs for details",
		})
		return
	}
	defer os.RemoveAll(stagingDir) // Guaranteed cleanup on all exit paths (#14499)

	// extractTimeout bounds the tar extraction to prevent hanging on corrupt
	// archives or stalled I/O (#7241). Use uc.updateCtx as the parent so
	// user cancellation propagates to the extraction process (#7440).
	const extractTimeout = 5 * time.Minute
	parentCtx := uc.updateCtx
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	extractCtx, extractCancel := context.WithTimeout(parentCtx, extractTimeout)
	defer extractCancel()
	if err := safeTarExtract(extractCtx, tmpFile, stagingDir); err != nil {
		// If cancelled by the user, report as cancellation rather than failure (#7440)
		if uc.isCancelled() {
			uc.broadcast("update_progress", UpdateProgressPayload{
				Status:  "cancelled",
				Message: "Update cancelled by user during extraction",
			})
			return
		}
		uc.recordError(fmt.Sprintf("extract failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Extract failed",
			Error:   "check server logs for details",
		})
		return
	}

	// Check for cancellation after extraction (#7440, #7443)
	if uc.isCancelled() {
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "cancelled",
			Message: "Update cancelled by user",
		})
		return
	}

	// Find current binary location
	consolePath, err := exec.LookPath("console")
	if err != nil {
		// Try relative path under bin/
		consolePath = "./bin/console"
	}

	// Backup current binary. On Windows, os.Rename on a running executable
	// fails with ETXTBSY-equivalent locking (#7444). Use renameOrCopy which
	// falls back to copy+remove when rename fails.
	backupPath := consolePath + ".backup"
	if err := renameOrCopy(consolePath, backupPath); err != nil {
		uc.recordError(fmt.Sprintf("backup failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to back up current binary",
			Error:   "check server logs for details",
		})
		return
	}

	// Set permissions on the staged binary *before* moving it to the final
	// location. This prevents a window where power loss leaves a non-executable
	// binary at consolePath (#7445).
	// On Windows, chmod is a no-op — Windows does not use POSIX permission
	// bits and attempting to set them can return "Permission denied" (#11075).
	stagedBinary := filepath.Join(stagingDir, "console")
	// fileModeBinary is the permission bits for the installed console binary.
	const fileModeBinary = 0755
	if err := ChmodIfSupported(stagedBinary, fileModeBinary); err != nil {
		if rbErr := renameOrCopy(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after chmod error", "error", rbErr)
		}
		uc.recordError(fmt.Sprintf("chmod staged binary failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to set binary permissions, rolled back",
			Error:   "check server logs for details",
		})
		return
	}

	// Replace with new binary. os.Rename fails with EXDEV when staging
	// and target are on different filesystems (#7242), so fall back to
	// copy+sync when rename returns a *os.LinkError.
	if err := renameOrCopy(stagedBinary, consolePath); err != nil {
		// Attempt to restore the backup before returning
		if rbErr := renameOrCopy(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after rename error", "error", rbErr)
		}
		uc.recordError(fmt.Sprintf("replace rename failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to install new binary, rolled back",
			Error:   "check server logs for details",
		})
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "restarting",
		Message:  "Restarting backend...",
		Progress: 80,
	})

	uc.killBackend()
	if err := uc.restartBackend(); err != nil {
		// Rollback
		if rbErr := os.Rename(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after restart error", "error", rbErr)
		}
		uc.recordError(fmt.Sprintf("restart failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Restart failed, rolled back",
			Error:   "check server logs for details",
		})
		return
	}

	if uc.healthCheckFn != nil && !uc.healthCheckFn() {
		if rbErr := os.Rename(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after health check failure", "error", rbErr)
		}
		uc.killBackend()
		if rbErr := uc.restartBackend(); rbErr != nil {
			slog.Error("[AutoUpdate] rollback restartBackend failed", "error", rbErr)
		}
		uc.recordError("new version failed health check")
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "New version unhealthy, rolled back",
		})
		return
	}

	// Cleanup
	os.Remove(backupPath)

	uc.mu.Lock()
	uc.currentVersion = release.TagName
	uc.lastUpdateTime = time.Now()
	uc.lastUpdateError = ""
	uc.mu.Unlock()

	slog.Info("[AutoUpdate] binary updated", "version", release.TagName)
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "done",
		Message:  fmt.Sprintf("Updated to %s", release.TagName),
		Progress: 100,
	})
}


// maxDownloadBytes is the upper bound for downloadFile to prevent disk exhaustion (#14379).
const maxDownloadBytes = 512 * 1024 * 1024 // 512 MB

func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned %d", resp.StatusCode)
	}

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	limited := io.LimitReader(resp.Body, maxDownloadBytes+1)
	n, err := io.Copy(f, limited)
	if err != nil {
		return err
	}
	if n > maxDownloadBytes {
		return fmt.Errorf("download exceeds maximum allowed size (%d bytes)", maxDownloadBytes)
	}
	return nil
}

// safeTarExtract extracts a .tar.gz archive to destDir, validating that no
// extracted path escapes the destination directory (zip-slip prevention, CWE-22).
// It also enforces a maximum file size and file count to prevent resource exhaustion.
func safeTarExtract(ctx context.Context, archivePath, destDir string) error {
	const maxExtractedFileSize = 500 * 1024 * 1024 // 500 MB per file
	const maxFileCount = 1000

	absDestDir, err := filepath.Abs(destDir)
	if err != nil {
		return fmt.Errorf("resolve dest dir: %w", err)
	}
	cleanDestDir := filepath.Clean(absDestDir)
	destDirPrefix := cleanDestDir + string(os.PathSeparator)

	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	fileCount := 0

	for {
		// Check context cancellation between entries
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar header: %w", err)
		}

		fileCount++
		if fileCount > maxFileCount {
			return fmt.Errorf("archive contains too many files (max %d)", maxFileCount)
		}

		cleanName := filepath.Clean(header.Name)
		if filepath.IsAbs(cleanName) {
			return fmt.Errorf("absolute path in archive: %s", header.Name)
		}
		target := filepath.Clean(filepath.Join(cleanDestDir, header.Name))
		if target != cleanDestDir && !strings.HasPrefix(target, destDirPrefix) {
			return fmt.Errorf("path traversal in archive: %s", header.Name)
		}

		relTarget, err := filepath.Rel(cleanDestDir, target)
		if err != nil {
			return fmt.Errorf("resolve archive path %s: %w", header.Name, err)
		}
		if relTarget == ".." || strings.HasPrefix(relTarget, ".."+string(os.PathSeparator)) {
			return fmt.Errorf("path traversal in archive: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			const dirMode = 0750
			if err := os.MkdirAll(target, dirMode); err != nil {
				return fmt.Errorf("create dir %s: %w", cleanName, err)
			}
		case tar.TypeReg:
			if header.Size > maxExtractedFileSize {
				return fmt.Errorf("file %s exceeds max size (%d > %d)", cleanName, header.Size, maxExtractedFileSize)
			}
			// Ensure parent directory exists
			const parentDirMode = 0750
			if err := os.MkdirAll(filepath.Dir(target), parentDirMode); err != nil {
				return fmt.Errorf("create parent dir for %s: %w", cleanName, err)
			}
			const fileMode = 0640
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(fileMode))
			if err != nil {
				return fmt.Errorf("create file %s: %w", cleanName, err)
			}
			written, copyErr := io.Copy(out, io.LimitReader(tr, maxExtractedFileSize+1))
			closeErr := out.Close()
			if copyErr != nil {
				return fmt.Errorf("write file %s: %w", cleanName, copyErr)
			}
			if closeErr != nil {
				return fmt.Errorf("close file %s: %w", cleanName, closeErr)
			}
			if written > maxExtractedFileSize {
				return fmt.Errorf("file %s exceeds max size during extraction", cleanName)
			}
		case tar.TypeSymlink, tar.TypeLink:
			// Reject symlinks — they can be used to escape the directory
			return fmt.Errorf("archive contains disallowed link entry: %s", header.Name)
		default:
			// Skip other types (block devices, char devices, etc.)
			slog.Warn("[AutoUpdate] skipping unsupported tar entry type", "name", header.Name, "type", header.Typeflag)
		}
	}

	return nil
}
