package updater

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// initGitRepo creates a temporary git repo with one commit and returns its path.
func initGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=test",
			"GIT_AUTHOR_EMAIL=test@test.com",
			"GIT_COMMITTER_NAME=test",
			"GIT_COMMITTER_EMAIL=test@test.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v failed: %v\n%s", args, err, out)
		}
	}

	run("init", "-b", "main")
	run("config", "user.email", "test@test.com")
	run("config", "user.name", "test")
	if err := os.WriteFile(filepath.Join(dir, "file.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "initial")

	return dir
}

func TestHasUncommittedChanges_EmptyPath(t *testing.T) {
	if hasUncommittedChanges("") {
		t.Error("expected false for empty path")
	}
}

func TestHasUncommittedChanges_CleanRepo(t *testing.T) {
	dir := initGitRepo(t)
	if hasUncommittedChanges(dir) {
		t.Error("expected no uncommitted changes in clean repo")
	}
}

func TestHasUncommittedChanges_DirtyRepo(t *testing.T) {
	dir := initGitRepo(t)
	// Create a tracked file modification
	if err := os.WriteFile(filepath.Join(dir, "file.txt"), []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}
	if !hasUncommittedChanges(dir) {
		t.Error("expected uncommitted changes after modifying tracked file")
	}
}

func TestHasUncommittedChanges_NonExistentPath(t *testing.T) {
	// Non-existent path => git errors => returns true (assume dirty)
	if !hasUncommittedChanges("/nonexistent/path/xyz") {
		t.Error("expected true for non-existent path (error case)")
	}
}

func TestRunGitPullWithTimeout_NoRemote(t *testing.T) {
	dir := initGitRepo(t)
	// No remote configured, so pull should fail
	err := runGitPullWithTimeout(dir, 5*time.Second)
	if err == nil {
		t.Error("expected error pulling without a remote")
	}
}

func TestRunGitPullWithTimeout_Timeout(t *testing.T) {
	dir := initGitRepo(t)
	// Use an extremely short timeout
	err := runGitPullWithTimeout(dir, 1*time.Nanosecond)
	if err == nil {
		t.Error("expected timeout error")
	}
}

func TestGitStash_CleanRepo(t *testing.T) {
	dir := initGitRepo(t)
	// No changes to stash
	if gitStash(dir) {
		t.Error("expected false when no uncommitted changes")
	}
}

func TestGitStash_DirtyRepo(t *testing.T) {
	dir := initGitRepo(t)
	// Modify a tracked file
	if err := os.WriteFile(filepath.Join(dir, "file.txt"), []byte("changed"), 0644); err != nil {
		t.Fatal(err)
	}
	if !gitStash(dir) {
		t.Error("expected stash to succeed with dirty working tree")
	}
	// After stash, repo should be clean
	if hasUncommittedChanges(dir) {
		t.Error("expected clean repo after stash")
	}
}

func TestGitStashPop_RestoresChanges(t *testing.T) {
	dir := initGitRepo(t)
	original := []byte("modified content")
	if err := os.WriteFile(filepath.Join(dir, "file.txt"), original, 0644); err != nil {
		t.Fatal(err)
	}
	if !gitStash(dir) {
		t.Fatal("stash failed")
	}
	gitStashPop(dir)
	data, err := os.ReadFile(filepath.Join(dir, "file.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != string(original) {
		t.Errorf("expected restored content %q, got %q", original, data)
	}
}

func TestGitStashPop_EmptyStash(t *testing.T) {
	dir := initGitRepo(t)
	// Pop on empty stash should not panic (just logs error)
	gitStashPop(dir)
}

func TestRollbackGit_EmptyArgs(t *testing.T) {
	// Should be a no-op for empty args
	rollbackGit("", "abc123")
	rollbackGit("/some/path", "")
}

func TestRollbackGit_ResetsToSHA(t *testing.T) {
	dir := initGitRepo(t)

	// Get the initial SHA
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	initialSHA := string(out[:len(out)-1]) // trim newline

	// Create a second commit
	if err := os.WriteFile(filepath.Join(dir, "file2.txt"), []byte("second"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "add", ".")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "commit", "-m", "second")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test",
		"GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=test",
		"GIT_COMMITTER_EMAIL=test@test.com",
	)
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}

	// Rollback to initial SHA
	rollbackGit(dir, initialSHA)

	// Verify HEAD is now at initial SHA
	cmd = exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, err = cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	if string(out[:len(out)-1]) != initialSHA {
		t.Errorf("expected HEAD at %s, got %s", initialSHA, string(out[:len(out)-1]))
	}
}
