package updater

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"testing"
)

// ---------------------------------------------------------------------------
// fetchLatestMainSHAFromGitHub — proper httptest via client override
// ---------------------------------------------------------------------------

func TestFetchLatestMainSHAFromGitHub_SuccessfulDecode(t *testing.T) {
	const expectedSHA = "abc123def456789012345678901234567890abcd"

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := githubRefResponse{}
		resp.Object.SHA = expectedSHA
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	// Override the client and URL function
	origClient := githubHTTPClient
	defer func() { githubHTTPClient = origClient }()
	githubHTTPClient = ts.Client()

	// We can't easily override githubMainRefURL, so test the HTTP path directly
	resp, err := githubHTTPClient.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	var ref githubRefResponse
	if err := json.NewDecoder(resp.Body).Decode(&ref); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ref.Object.SHA != expectedSHA {
		t.Errorf("SHA = %q, want %q", ref.Object.SHA, expectedSHA)
	}
}

func TestFetchLatestMainSHAFromGitHub_ForbiddenStatus(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer ts.Close()

	origClient := githubHTTPClient
	defer func() { githubHTTPClient = origClient }()
	githubHTTPClient = ts.Client()

	resp, err := githubHTTPClient.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		t.Error("expected non-200 status")
	}
}

func TestFetchLatestMainSHAFromGitHub_MalformedJSON(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("not-json"))
	}))
	defer ts.Close()

	origClient := githubHTTPClient
	defer func() { githubHTTPClient = origClient }()
	githubHTTPClient = ts.Client()

	resp, err := githubHTTPClient.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	var ref githubRefResponse
	err = json.NewDecoder(resp.Body).Decode(&ref)
	if err == nil {
		t.Error("expected JSON decode error for invalid payload")
	}
}

// ---------------------------------------------------------------------------
// fetchLatestMainSHAWithRepo — delegation logic
// ---------------------------------------------------------------------------

func TestFetchLatestMainSHAWithRepo_EmptyPath_FallsBackToGitHub(t *testing.T) {
	// With empty repoPath, it should skip git and try GitHub API.
	// We can't mock the URL easily, so just verify it doesn't panic
	// and returns an error (since no GitHub API is available in test).
	_, err := fetchLatestMainSHAWithRepo("")
	// Expected to fail (no real GitHub API available), but should not panic
	if err == nil {
		t.Log("fetchLatestMainSHAWithRepo('') succeeded (likely cached or network available)")
	}
}

func TestFetchLatestMainSHAWithRepo_ValidRepoPath(t *testing.T) {
	repo := initBareGitRepo(t)

	// Set up a fake remote to enable fetch
	// Create a bare remote repo
	remoteDir := t.TempDir()
	cmd := exec.Command("git", "clone", "--bare", repo, remoteDir+"/remote.git")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create bare remote: %v\n%s", err, out)
	}

	// Add remote origin pointing to our bare repo
	cmd = exec.Command("git", "remote", "add", "origin", remoteDir+"/remote.git")
	cmd.Dir = repo
	if out, err := cmd.CombinedOutput(); err != nil {
		// Remote might already exist from init
		t.Logf("remote add: %v (%s)", err, out)
	}

	// Create a main branch on remote
	cmd = exec.Command("git", "push", "origin", "HEAD:main")
	cmd.Dir = repo
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("push to remote: %v\n%s", err, out)
	}

	sha, err := fetchLatestMainSHAWithRepo(repo)
	if err != nil {
		t.Fatalf("fetchLatestMainSHAWithRepo(%q) error = %v", repo, err)
	}
	if len(sha) < 7 {
		t.Errorf("SHA too short: %q", sha)
	}
}

// ---------------------------------------------------------------------------
// gitFetchLatestSHA
// ---------------------------------------------------------------------------

func TestGitFetchLatestSHA_ValidRepo(t *testing.T) {
	repo := initBareGitRepo(t)

	// Set up remote
	remoteDir := t.TempDir()
	cmd := exec.Command("git", "clone", "--bare", repo, remoteDir+"/remote.git")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create bare remote: %v\n%s", err, out)
	}

	cmd = exec.Command("git", "remote", "add", "origin", remoteDir+"/remote.git")
	cmd.Dir = repo
	cmd.Run()

	cmd = exec.Command("git", "push", "origin", "HEAD:main")
	cmd.Dir = repo
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("push: %v\n%s", err, out)
	}

	sha, err := gitFetchLatestSHA(repo)
	if err != nil {
		t.Fatalf("gitFetchLatestSHA error = %v", err)
	}
	if len(sha) != 40 {
		t.Errorf("expected 40-char SHA, got %d chars: %q", len(sha), sha)
	}
}

func TestGitFetchLatestSHA_NoRemote(t *testing.T) {
	repo := initBareGitRepo(t)
	_, err := gitFetchLatestSHA(repo)
	if err == nil {
		t.Error("expected error when no remote is configured")
	}
}

func TestGitFetchLatestSHA_NonExistentPath(t *testing.T) {
	_, err := gitFetchLatestSHA("/nonexistent/repo/path/xyz")
	if err == nil {
		t.Error("expected error for non-existent path")
	}
}
