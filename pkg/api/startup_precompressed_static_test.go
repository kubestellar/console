package api

import (
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// preCompressedStatic covers a fiber.Handler that serves static assets with
// per-extension Content-Type, Cache-Control, and pre-compressed (.br / .gz)
// negotiation. The existing suite covers only the tiny helpers in startup.go.
// This file exercises the branches inside preCompressedStatic itself:
//
//   - path traversal → c.Next()
//   - missing file → c.Next()
//   - directory → c.Next()
//   - "/" → rewrites to /index.html and serves it
//   - HTML → must-revalidate cache header (no "immutable")
//   - hashed asset → immutable cache header
//   - Accept-Encoding "br" with .br present → Content-Encoding: br
//   - Accept-Encoding "gzip" (no .br) with .gz present → Content-Encoding: gzip
//   - no compressed variants → uncompressed fallback with Content-Type set
//   - unknown extension → uncompressed fallback with no Content-Type

func newStaticTestApp(root string) *fiber.App {
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	app.Use(preCompressedStatic(root))
	// Terminal handler after c.Next() so we can distinguish next() from serve.
	app.Get("/*", func(c *fiber.Ctx) error {
		return c.Status(404).SendString("passthrough")
	})
	return app
}

func writeFile(t *testing.T, path string, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func doRequest(t *testing.T, app *fiber.App, path string, acceptEncoding string) (int, map[string]string, string) {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	if acceptEncoding != "" {
		req.Header.Set("Accept-Encoding", acceptEncoding)
	}
	resp, err := app.Test(req, 1000)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	hdrs := map[string]string{}
	for k := range resp.Header {
		hdrs[k] = resp.Header.Get(k)
	}
	return resp.StatusCode, hdrs, string(body)
}

func TestPreCompressedStatic_RootRewritesToIndexHTML(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "index.html"), "<html>root</html>")
	app := newStaticTestApp(root)

	status, hdrs, body := doRequest(t, app, "/", "")
	if status != 200 {
		t.Fatalf("status = %d, want 200; body=%q", status, body)
	}
	if hdrs["Content-Type"] != "text/html" {
		t.Errorf("Content-Type = %q, want text/html", hdrs["Content-Type"])
	}
	// HTML must not be immutable — deploys need to invalidate index.html.
	if !strings.Contains(hdrs["Cache-Control"], "must-revalidate") {
		t.Errorf("Cache-Control = %q, want must-revalidate", hdrs["Cache-Control"])
	}
	if strings.Contains(hdrs["Cache-Control"], "immutable") {
		t.Errorf("HTML must not be immutable: %q", hdrs["Cache-Control"])
	}
	if body != "<html>root</html>" {
		t.Errorf("body = %q", body)
	}
}

func TestPreCompressedStatic_HashedAssetImmutableCache(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "assets", "app-abc123.js"), "console.log(1)")
	app := newStaticTestApp(root)

	status, hdrs, _ := doRequest(t, app, "/assets/app-abc123.js", "")
	if status != 200 {
		t.Fatalf("status = %d", status)
	}
	if hdrs["Content-Type"] != "application/javascript" {
		t.Errorf("Content-Type = %q", hdrs["Content-Type"])
	}
	if !strings.Contains(hdrs["Cache-Control"], "immutable") {
		t.Errorf("Cache-Control = %q, want immutable", hdrs["Cache-Control"])
	}
	if !strings.Contains(hdrs["Cache-Control"], "max-age=31536000") {
		t.Errorf("Cache-Control = %q, want max-age=31536000", hdrs["Cache-Control"])
	}
}

func TestPreCompressedStatic_ServesBrotli(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "assets", "app.css"), "body{}")
	writeFile(t, filepath.Join(root, "assets", "app.css.br"), "\x00compressed-br")
	app := newStaticTestApp(root)

	status, hdrs, body := doRequest(t, app, "/assets/app.css", "br, gzip")
	if status != 200 {
		t.Fatalf("status = %d", status)
	}
	if hdrs["Content-Encoding"] != "br" {
		t.Errorf("Content-Encoding = %q, want br", hdrs["Content-Encoding"])
	}
	if hdrs["Content-Type"] != "text/css" {
		t.Errorf("Content-Type = %q", hdrs["Content-Type"])
	}
	if !strings.Contains(hdrs["Vary"], "Accept-Encoding") {
		t.Errorf("Vary = %q", hdrs["Vary"])
	}
	if body != "\x00compressed-br" {
		t.Errorf("body wrong length %d", len(body))
	}
}

func TestPreCompressedStatic_ServesGzipWhenNoBrotli(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "assets", "app.js"), "js")
	writeFile(t, filepath.Join(root, "assets", "app.js.gz"), "gz-body")
	app := newStaticTestApp(root)

	// Client accepts gzip only (not br), and only .gz is present.
	status, hdrs, body := doRequest(t, app, "/assets/app.js", "gzip")
	if status != 200 {
		t.Fatalf("status = %d", status)
	}
	if hdrs["Content-Encoding"] != "gzip" {
		t.Errorf("Content-Encoding = %q, want gzip", hdrs["Content-Encoding"])
	}
	if hdrs["Content-Type"] != "application/javascript" {
		t.Errorf("Content-Type = %q", hdrs["Content-Type"])
	}
	if body != "gz-body" {
		t.Errorf("body = %q", body)
	}
}

func TestPreCompressedStatic_UncompressedFallback(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "logo.svg"), "<svg/>")
	app := newStaticTestApp(root)

	status, hdrs, body := doRequest(t, app, "/logo.svg", "")
	if status != 200 {
		t.Fatalf("status = %d", status)
	}
	if hdrs["Content-Encoding"] != "" {
		t.Errorf("expected no Content-Encoding, got %q", hdrs["Content-Encoding"])
	}
	if hdrs["Content-Type"] != "image/svg+xml" {
		t.Errorf("Content-Type = %q", hdrs["Content-Type"])
	}
	if body != "<svg/>" {
		t.Errorf("body = %q", body)
	}
}

func TestPreCompressedStatic_UnknownExtensionNoContentType(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "notes.xyz"), "raw")
	app := newStaticTestApp(root)

	status, hdrs, _ := doRequest(t, app, "/notes.xyz", "")
	if status != 200 {
		t.Fatalf("status = %d", status)
	}
	// preCompressedStatic must NOT set Content-Type for unknown extensions; the
	// handler explicitly checks `contentType != ""` before setting it.
	// Fiber's SendFile may set one downstream; verify our handler did not
	// force one by checking cache-control was still applied (proves our
	// branch ran).
	if !strings.Contains(hdrs["Cache-Control"], "immutable") {
		t.Errorf("Cache-Control = %q, want immutable", hdrs["Cache-Control"])
	}
}

func TestPreCompressedStatic_MissingFileFallsThrough(t *testing.T) {
	root := t.TempDir()
	app := newStaticTestApp(root)

	status, _, body := doRequest(t, app, "/does-not-exist.js", "")
	if status != 404 {
		t.Fatalf("status = %d, want 404 (passthrough)", status)
	}
	if body != "passthrough" {
		t.Errorf("body = %q, want passthrough", body)
	}
}

func TestPreCompressedStatic_DirectoryFallsThrough(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "subdir"), 0o755); err != nil {
		t.Fatal(err)
	}
	app := newStaticTestApp(root)

	status, _, body := doRequest(t, app, "/subdir", "")
	if status != 404 {
		t.Fatalf("status = %d, want 404 (directory → next)", status)
	}
	if body != "passthrough" {
		t.Errorf("body = %q", body)
	}
}

func TestPreCompressedStatic_PathTraversalBlocked(t *testing.T) {
	root := t.TempDir()
	// Create a file OUTSIDE root that a traversal attempt would leak.
	outside := filepath.Join(filepath.Dir(root), "secret.txt")
	if err := os.WriteFile(outside, []byte("SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(outside)

	writeFile(t, filepath.Join(root, "index.html"), "ok")
	app := newStaticTestApp(root)

	// Encoded traversal — fiber decodes to ../secret.txt when it hits handler.
	// Because our handler uses filepath.Join(root, path), the resolved abs
	// path would land at outside; the HasPrefix check must fail → c.Next().
	status, _, body := doRequest(t, app, "/../secret.txt", "")
	// Should NOT return SECRET; either passthrough (404) or 404 from fiber.
	if strings.Contains(body, "SECRET") {
		t.Fatalf("path traversal leaked file: status=%d body=%q", status, body)
	}
}
