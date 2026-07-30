package updater

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// initBareGitRepo creates a minimal git repo in a temp dir suitable for testing.
func initBareGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	cmds := [][]string{
		{"git", "init"},
		{"git", "config", "user.email", "test@test.com"},
		{"git", "config", "user.name", "Test"},
		{"git", "commit", "--allow-empty", "-m", "init"},
	}
	for _, args := range cmds {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%v failed: %v\n%s", args, err, out)
		}
	}
	return dir
}

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

// ---------------------------------------------------------------------------
// hasUncommittedChanges
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// gitStash / gitStashPop
// ---------------------------------------------------------------------------

func TestGitStash_NoChanges(t *testing.T) {
	repo := initBareGitRepo(t)
	got := gitStash(repo)
	if got != false {
		t.Error("expected false when there are no uncommitted changes to stash")
	}
}

func TestGitStash_CleanRepo(t *testing.T) {
	dir := initGitRepo(t)
	// No changes to stash
	if gitStash(dir) {
		t.Error("expected false when no uncommitted changes")
	}
}

func TestGitStash_WithChanges(t *testing.T) {
	repo := initBareGitRepo(t)

	// Create and commit a file, then modify it
	f := filepath.Join(repo, "data.txt")
	os.WriteFile(f, []byte("v1"), 0644)
	for _, args := range [][]string{
		{"git", "add", "data.txt"},
		{"git", "commit", "-m", "add data"},
	} {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = repo
		cmd.Run()
	}

	// Modify and stage
	os.WriteFile(f, []byte("v2"), 0644)
	cmd := exec.Command("git", "add", "data.txt")
	cmd.Dir = repo
	cmd.Run()

	got := gitStash(repo)
	if got != true {
		t.Error("expected true when stashing uncommitted changes")
	}

	// After stash, working tree should be clean
	if hasUncommittedChanges(repo) {
		t.Error("expected clean working tree after stash")
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

// ---------------------------------------------------------------------------
// runGitPullWithTimeout
// ---------------------------------------------------------------------------

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

func TestRunGitPullWithTimeout_NonExistentPath(t *testing.T) {
	err := runGitPullWithTimeout("/nonexistent/repo/path", 5000000000)
	if err == nil {
		t.Fatal("expected error for non-existent path")
	}
}

// ---------------------------------------------------------------------------
// rollbackGit
// ---------------------------------------------------------------------------

func TestRollbackGit_EmptyInputs(t *testing.T) {
	// Should not panic with empty inputs
	rollbackGit("", "abc123")
	rollbackGit("/some/path", "")
	rollbackGit("", "")
}

func TestRollbackGit_ValidRepo(t *testing.T) {
	repo := initBareGitRepo(t)

	// Create a second commit
	f := filepath.Join(repo, "rollback.txt")
	os.WriteFile(f, []byte("data"), 0644)
	for _, args := range [][]string{
		{"git", "add", "rollback.txt"},
		{"git", "commit", "-m", "second commit"},
	} {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = repo
		cmd.Run()
	}

	// Get first commit SHA
	cmd := exec.Command("git", "rev-parse", "HEAD~1")
	cmd.Dir = repo
	firstOut, err := cmd.Output()
	if err != nil {
		t.Fatalf("git rev-parse HEAD~1: %v", err)
	}
	firstSHA := strings.TrimRight(string(firstOut), "\n")

	// Rollback to first commit
	rollbackGit(repo, firstSHA)

	// Verify HEAD is now the first commit
	cmd = exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repo
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("git rev-parse HEAD: %v", err)
	}
	got := strings.TrimRight(string(out), "\n")
	if got != firstSHA {
		t.Errorf("after rollback HEAD = %q, want %q", got, firstSHA)
	}
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
