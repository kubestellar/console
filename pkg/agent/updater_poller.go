package agent

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

func (uc *UpdateChecker) run(ctx context.Context) {
	uc.mu.Lock()
	interval := releaseCheckInterval
	if uc.channel == "developer" {
		interval = developerCheckInterval
	}
	uc.mu.Unlock()

	// Initial delay to let everything start up
	select {
	case <-ctx.Done():
		return
	case <-time.After(30 * time.Second):
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			uc.mu.Lock()
			enabled := uc.enabled
			uc.mu.Unlock()
			if enabled {
				uc.checkAndUpdate()
			}
		}
	}
}

func (uc *UpdateChecker) checkAndUpdate() {
	uc.mu.Lock()
	channel := uc.channel
	installMethod := uc.installMethod
	uc.mu.Unlock()

	if installMethod == "helm" {
		return // helm installs are managed externally
	}

	switch channel {
	case "developer":
		uc.checkDeveloperChannel()
	case "stable", "unstable":
		uc.checkReleaseChannel(channel)
	}
}

func (uc *UpdateChecker) checkDeveloperChannel() {
	uc.mu.Lock()
	repoPath := uc.repoPath
	currentSHA := uc.currentSHA
	uc.mu.Unlock()

	if repoPath == "" {
		slog.Info("[AutoUpdate] Developer channel requires a git repo, skipping")
		return
	}

	latestSHA, err := fetchLatestMainSHAWithRepo(repoPath)
	if err != nil {
		slog.Error("[AutoUpdate] failed to check main SHA", "error", err)
		return
	}

	// Re-read currentSHA from repo in case it was updated externally
	if freshSHA := detectCurrentSHA(repoPath); freshSHA != "" {
		uc.mu.Lock()
		uc.currentSHA = freshSHA
		currentSHA = freshSHA
		uc.mu.Unlock()
	}

	if latestSHA == currentSHA || currentSHA == "" {
		slog.Info("[AutoUpdate] already up to date, no update needed", "sha", short(currentSHA))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:   "done",
			Message:  "Already up to date — no changes on main",
			Progress: 100,
		})
		return
	}

	slog.Info("[AutoUpdate] new commit on main", "from", short(currentSHA), "to", short(latestSHA))
	uc.executeDeveloperUpdate(latestSHA)
}

// checkCancelled returns true if the user has requested cancellation. It
// broadcasts a "cancelled" status with the current progress percentage and
// logs the abort. Callers should return immediately after a true result.
// previousSHA is used to roll back any partial git changes.
func (uc *UpdateChecker) checkReleaseChannel(channel string) {
	uc.mu.Lock()
	currentVersion := uc.currentVersion
	installMethod := uc.installMethod
	uc.mu.Unlock()

	targetType := "weekly"
	if channel == "unstable" {
		targetType = "nightly"
	}

	releases, err := fetchGitHubReleases()
	if err != nil {
		slog.Error("[AutoUpdate] failed to fetch releases", "error", err)
		return
	}

	var latest *githubReleaseInfo
	for i := range releases {
		if strings.Contains(releases[i].TagName, targetType) {
			latest = &releases[i]
			break
		}
	}

	if latest == nil || latest.TagName == currentVersion {
		slog.Info("[AutoUpdate] already on latest release", "channel", channel, "version", currentVersion)
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:   "done",
			Message:  fmt.Sprintf("Already up to date — running latest %s release", channel),
			Progress: 100,
		})
		return
	}

	slog.Info("[AutoUpdate] new release available", "current", currentVersion, "latest", latest.TagName)

	switch installMethod {
	case "binary":
		uc.executeBinaryUpdate(latest)
	case "dev":
		uc.executeDevReleaseUpdate(latest)
	}
}

