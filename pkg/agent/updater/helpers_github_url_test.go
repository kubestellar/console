package updater

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// These tests target the real functions (not just the HTTP wire) by
// overriding the package-level URL variables so the httptest server can
// respond directly. This covers fetchLatestMainSHA, fetchLatestMainSHAFromGitHub,
// and fetchGitHubReleases end-to-end without hitting api.github.com.

// swapClientAndMainURL points githubHTTPClient and githubMainRefURL at ts.
func swapClientAndMainURL(t *testing.T, ts *httptest.Server) {
	t.Helper()
	origClient := githubHTTPClient
	origURL := githubMainRefURL
	githubHTTPClient = ts.Client()
	githubMainRefURL = func() string { return ts.URL }
	t.Cleanup(func() {
		githubHTTPClient = origClient
		githubMainRefURL = origURL
	})
}

// swapClientAndReleasesURL points githubHTTPClient and githubReleasesURL at ts.
func swapClientAndReleasesURL(t *testing.T, ts *httptest.Server) {
	t.Helper()
	origClient := githubHTTPClient
	origURL := githubReleasesURL
	githubHTTPClient = ts.Client()
	githubReleasesURL = func() string { return ts.URL }
	t.Cleanup(func() {
		githubHTTPClient = origClient
		githubReleasesURL = origURL
	})
}

func TestFetchLatestMainSHA_Success(t *testing.T) {
	const wantSHA = "abc123def456789012345678901234567890abcd"
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := githubRefResponse{}
		resp.Object.SHA = wantSHA
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()
	swapClientAndMainURL(t, ts)

	got, err := fetchLatestMainSHA()
	if err != nil {
		t.Fatalf("fetchLatestMainSHA error = %v", err)
	}
	if got != wantSHA {
		t.Errorf("SHA = %q, want %q", got, wantSHA)
	}
}

func TestFetchLatestMainSHAFromGitHub_NonOKStatus(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer ts.Close()
	swapClientAndMainURL(t, ts)

	_, err := fetchLatestMainSHAFromGitHub()
	if err == nil {
		t.Fatal("expected error for non-OK status, got nil")
	}
}

func TestFetchLatestMainSHAFromGitHub_BadJSON(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("not-json"))
	}))
	defer ts.Close()
	swapClientAndMainURL(t, ts)

	_, err := fetchLatestMainSHAFromGitHub()
	if err == nil {
		t.Fatal("expected JSON decode error, got nil")
	}
}

func TestFetchLatestMainSHAFromGitHub_TransportError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	// Close immediately so the request fails at the transport layer.
	ts.Close()
	swapClientAndMainURL(t, ts)

	_, err := fetchLatestMainSHAFromGitHub()
	if err == nil {
		t.Fatal("expected transport error, got nil")
	}
}

func TestFetchGitHubReleases_SuccessOverrideURL(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		releases := []githubReleaseInfo{
			{
				TagName: "v1.2.3",
				Assets: []struct {
					Name               string `json:"name"`
					BrowserDownloadURL string `json:"browser_download_url"`
				}{
					{Name: "kc-agent-linux-amd64.tar.gz", BrowserDownloadURL: "https://example.test/kc-agent-linux-amd64.tar.gz"},
				},
			},
			{TagName: "v1.2.2"},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(releases)
	}))
	defer ts.Close()
	swapClientAndReleasesURL(t, ts)

	got, err := fetchGitHubReleases()
	if err != nil {
		t.Fatalf("fetchGitHubReleases error = %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 releases, got %d", len(got))
	}
	if got[0].TagName != "v1.2.3" {
		t.Errorf("first release tag = %q, want v1.2.3", got[0].TagName)
	}
	if len(got[0].Assets) != 1 || got[0].Assets[0].Name != "kc-agent-linux-amd64.tar.gz" {
		t.Errorf("unexpected assets for first release: %+v", got[0].Assets)
	}
}

func TestFetchGitHubReleases_NonOKStatus(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer ts.Close()
	swapClientAndReleasesURL(t, ts)

	_, err := fetchGitHubReleases()
	if err == nil {
		t.Fatal("expected error for non-OK status, got nil")
	}
}

func TestFetchGitHubReleases_BadJSON(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{not-json"))
	}))
	defer ts.Close()
	swapClientAndReleasesURL(t, ts)

	_, err := fetchGitHubReleases()
	if err == nil {
		t.Fatal("expected JSON decode error, got nil")
	}
}

func TestFetchGitHubReleases_TransportError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	ts.Close()
	swapClientAndReleasesURL(t, ts)

	_, err := fetchGitHubReleases()
	if err == nil {
		t.Fatal("expected transport error, got nil")
	}
}
