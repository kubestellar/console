package agent

import (
	"context"
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
	extractCmd := exec.CommandContext(extractCtx, "tar", "xzf", tmpFile, "-C", stagingDir)
	if err := extractCmd.Run(); err != nil {
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
	if err := chmodIfSupported(stagedBinary, fileModeBinary); err != nil {
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

	if !waitForBackendHealth() {
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

func waitForBackendHealth() bool {
	// URL is resolved once per poll so that a BACKEND_PORT env var change
	// mid-run (e.g. an operator re-running startup-oauth.sh) is picked up.
	healthURL := backendHealthURL()
	for i := 0; i < healthCheckRetries; i++ {
		resp, err := healthCheckHTTPClient.Get(healthURL)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true
			}
		}
		time.Sleep(healthCheckDelay)
	}
	return false
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
