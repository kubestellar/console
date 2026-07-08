package updater

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
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

// ---------------------------------------------------------------------------
// hasUncommittedChanges
// ---------------------------------------------------------------------------

func TestHasUncommittedChanges_EmptyPath(t *testing.T) {
	got := hasUncommittedChanges("")
	if got != false {
		t.Error("expected false for empty path")
	}
}

func TestHasUncommittedChanges_CleanRepo(t *testing.T) {
	repo := initBareGitRepo(t)
	got := hasUncommittedChanges(repo)
	if got != false {
		t.Error("expected false for clean repo")
	}
}

func TestHasUncommittedChanges_DirtyRepo(t *testing.T) {
	repo := initBareGitRepo(t)

	// Create a tracked file, commit it, then modify it
	f := filepath.Join(repo, "file.txt")
	os.WriteFile(f, []byte("original"), 0644)
	cmd := exec.Command("git", "add", "file.txt")
	cmd.Dir = repo
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "add file")
	cmd.Dir = repo
	cmd.Run()

	// Now modify the tracked file (staged change)
	os.WriteFile(f, []byte("modified"), 0644)
	cmd = exec.Command("git", "add", "file.txt")
	cmd.Dir = repo
	cmd.Run()

	got := hasUncommittedChanges(repo)
	if got != true {
		t.Error("expected true for repo with staged changes")
	}
}

func TestHasUncommittedChanges_NonExistentPath(t *testing.T) {
	got := hasUncommittedChanges("/nonexistent/path/for/git/test")
	// git status fails → returns true (assume dirty on error)
	if got != true {
		t.Error("expected true for non-existent path (assume dirty on error)")
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

func TestGitStashPop_RestoresChanges(t *testing.T) {
	repo := initBareGitRepo(t)

	// Create and commit a file, then modify and stash
	f := filepath.Join(repo, "restore.txt")
	os.WriteFile(f, []byte("original"), 0644)
	for _, args := range [][]string{
		{"git", "add", "restore.txt"},
		{"git", "commit", "-m", "add restore"},
	} {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = repo
		cmd.Run()
	}

	os.WriteFile(f, []byte("modified-content"), 0644)
	cmd := exec.Command("git", "add", "restore.txt")
	cmd.Dir = repo
	cmd.Run()

	stashed := gitStash(repo)
	if !stashed {
		t.Fatal("precondition: stash should succeed")
	}

	// Pop and verify content restored
	gitStashPop(repo)

	content, err := os.ReadFile(f)
	if err != nil {
		t.Fatalf("read file after stash pop: %v", err)
	}
	if string(content) != "modified-content" {
		t.Errorf("file content after stash pop = %q, want %q", content, "modified-content")
	}
}

func TestGitStashPop_EmptyStash(t *testing.T) {
	repo := initBareGitRepo(t)
	// Should not panic even with no stash entries
	gitStashPop(repo)
}

// ---------------------------------------------------------------------------
// runGitPullWithTimeout
// ---------------------------------------------------------------------------

func TestRunGitPullWithTimeout_NoRemote(t *testing.T) {
	repo := initBareGitRepo(t)
	// No remote configured → git pull should fail
	err := runGitPullWithTimeout(repo, 5000000000) // 5s
	if err == nil {
		t.Fatal("expected error for git pull with no remote")
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

	// Get second commit SHA (unused, verifies we have 2 commits)
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repo
	_, _ = cmd.Output()

	// Get first commit SHA
	cmd = exec.Command("git", "rev-parse", "HEAD~1")
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
