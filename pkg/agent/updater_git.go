package agent

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"
)

func hasUncommittedChanges(repoPath string) bool {
	if repoPath == "" {
		return false
	}
	const gitStatusTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitStatusTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "status", "--porcelain", "-uno")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return true // assume dirty on error
	}
	return len(strings.TrimSpace(string(out))) > 0
}

// runGitPullWithTimeout runs git pull with a hard timeout to prevent hanging on network issues.
func runGitPullWithTimeout(repoPath string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "pull", "--ff-only", "origin", "main")
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("timed out after %s", timeout)
	}
	if err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// gitStashTimeout is the hard deadline for git stash operations.
const gitStashTimeout = 60 * time.Second

// gitStash stashes uncommitted changes if any exist. Returns true if a stash was created.
func gitStash(repoPath string) bool {
	if !hasUncommittedChanges(repoPath) {
		return false
	}
	slog.Info("[AutoUpdate] Stashing uncommitted changes before update")
	ctx, cancel := context.WithTimeout(context.Background(), gitStashTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "stash", "push", "-m", "auto-update: stashed by kc-agent")
	cmd.Dir = repoPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		slog.Error("[AutoUpdate] git stash failed", "error", err)
		return false
	}
	return true
}

// gitStashPop restores previously stashed changes.
func gitStashPop(repoPath string) {
	slog.Info("[AutoUpdate] Restoring stashed changes")
	ctx, cancel := context.WithTimeout(context.Background(), gitStashTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "stash", "pop")
	cmd.Dir = repoPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		slog.Error("[AutoUpdate] git stash pop failed (changes saved in stash)", "error", err)
	}
}

func rollbackGit(repoPath, sha string) {
	if sha == "" || repoPath == "" {
		return
	}
	// gitRollbackTimeout is the hard deadline for a rollback git-reset.
	const gitRollbackTimeout = 30 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitRollbackTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "reset", "--hard", sha)
	cmd.Dir = repoPath
	if err := cmd.Run(); err != nil {
		slog.Error("[AutoUpdate] rollback failed", "sha", short(sha), "error", err)
	}
}
