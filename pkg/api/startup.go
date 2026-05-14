package api

import (
"context"
"crypto/rand"
"encoding/hex"
"fmt"
"log/slog"
"net"
"net/http"
"os"
"os/exec"
"path/filepath"
"strings"
"sync/atomic"
"time"

"github.com/gofiber/fiber/v2"

"github.com/kubestellar/console/pkg/api/handlers"
"github.com/kubestellar/console/pkg/api/middleware"
"github.com/kubestellar/console/pkg/fileutil"
"github.com/kubestellar/console/pkg/safego"
)

// startLoadingServer starts a temporary HTTP server that serves a loading page.
// It returns immediately — the server runs in a background goroutine.
//
// The loading server intentionally returns HTTP 503 (Service Unavailable) on
// /health while the real Fiber app is still initializing. This matters for
// readiness probes, smoke tests, and `curl -sf` style checks (#9904): without
// it, callers think the backend is ready as soon as the loading page binds,
// race ahead to real API routes like /auth/github, and get the loading HTML
// back with HTTP 200 — which looks like a broken auth contract but is
// actually the loading page's catch-all `/` handler answering the request.
// A 503 on /health forces probes to keep polling until the real server is up.
func startLoadingServer(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// 503 + Retry-After tells orchestrators and smoke tests the backend is
		// not ready yet. The body still describes the state for human debugging.
		const loadingHealthRetryAfterSec = "1"
		w.Header().Set("Retry-After", loadingHealthRetryAfterSec)
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"starting"}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(startupLoadingHTML))
	})

	srv := &http.Server{Addr: addr, Handler: mux}
	safego.GoWith("loading-page-server", func() {
		slog.Info("[Server] loading page available", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("[Server] loading server error", "error", err)
		}
	})
	// Give the listener time to bind
	time.Sleep(serverStartupDelay)
	return srv
}

// preCompressedStatic serves pre-compressed (.br, .gz) static assets with Content-Length headers.
// This avoids chunked Transfer-Encoding, preventing ERR_INCOMPLETE_CHUNKED_ENCODING on slow networks.
func preCompressedStatic(root string) fiber.Handler {
	const oneYear = 31536000
	return func(c *fiber.Ctx) error {
		p := c.Path()
		if p == "/" || p == "" {
			p = "/index.html"
		}
		filePath := filepath.Join(root, p)

		// Security: prevent path traversal — ensure resolved path stays within root
		absRoot, _ := filepath.Abs(root)
		absFile, _ := filepath.Abs(filePath)
		if !strings.HasPrefix(absFile, absRoot+string(filepath.Separator)) && absFile != absRoot {
			return c.Next()
		}

		// Only serve actual static files
		info, err := os.Stat(filePath)
		if err != nil || info.IsDir() {
			return c.Next()
		}

		// Content type
		ext := filepath.Ext(filePath)
		contentType := ""
		// HTML files must not be cached with immutable — they contain chunk
		// references that change on every deploy. Only hashed assets (.js, .css)
		// should use long-term immutable caching.
		isHTML := false
		switch ext {
		case ".js":
			contentType = "application/javascript"
		case ".css":
			contentType = "text/css"
		case ".html":
			contentType = "text/html"
			isHTML = true
		case ".json":
			contentType = "application/json"
		case ".svg":
			contentType = "image/svg+xml"
		case ".wasm":
			contentType = "application/wasm"
		case ".woff2":
			contentType = "font/woff2"
		case ".woff":
			contentType = "font/woff"
		case ".png":
			contentType = "image/png"
		case ".ico":
			contentType = "image/x-icon"
		case ".webmanifest":
			contentType = "application/manifest+json"
		}

		// HTML must revalidate on every request so deploys take effect immediately.
		// Hashed assets (.js, .css) are immutable — filenames change on rebuild.
		cacheHeader := fmt.Sprintf("public, max-age=%d, immutable", oneYear)
		if isHTML {
			cacheHeader = "public, max-age=0, must-revalidate"
		}

		accept := c.Get("Accept-Encoding")

		// Try brotli first, then gzip
		if strings.Contains(accept, "br") {
			brPath := filePath + ".br"
			if brInfo, err := os.Stat(brPath); err == nil {
				c.Set("Content-Encoding", "br")
				c.Set("Content-Type", contentType)
				c.Set("Cache-Control", cacheHeader)
				c.Set("Content-Length", fmt.Sprintf("%d", brInfo.Size()))
				c.Set("Vary", "Accept-Encoding")
				return c.SendFile(brPath)
			}
		}
		if strings.Contains(accept, "gzip") {
			gzPath := filePath + ".gz"
			if gzInfo, err := os.Stat(gzPath); err == nil {
				c.Set("Content-Encoding", "gzip")
				c.Set("Content-Type", contentType)
				c.Set("Cache-Control", cacheHeader)
				c.Set("Content-Length", fmt.Sprintf("%d", gzInfo.Size()))
				c.Set("Vary", "Accept-Encoding")
				return c.SendFile(gzPath)
			}
		}

		// Fallback: serve uncompressed with cache headers
		if contentType != "" {
			c.Set("Content-Type", contentType)
		}
		c.Set("Cache-Control", cacheHeader)
		return c.SendFile(filePath)
	}
}

// In production (non-dev), frontend and backend are served from the same origin,
// so we use FrontendURL. In dev mode, they run on separate ports.
func (s *Server) backendURL() string {
	if !s.config.DevMode && s.config.FrontendURL != "" {
		return s.config.FrontendURL
	}
	port := s.config.Port
	if s.config.BackendPort > 0 {
		port = s.config.BackendPort
	}
	return fmt.Sprintf("http://localhost:%d", port)
}

// Start shuts down the temporary loading server and starts the real Fiber app.
func (s *Server) Start() error {
	// When BackendPort is set (watchdog mode), listen on that port instead
	listenPort := s.config.Port
	if s.config.BackendPort > 0 {
		listenPort = s.config.BackendPort
	}
	addr := fmt.Sprintf(":%d", listenPort)

	// Shut down the temporary loading page server to free the port
	if s.loadingSrv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), serverHealthTimeout)
		defer cancel()
		s.loadingSrv.Shutdown(ctx)
		s.loadingSrv = nil

		// Wait for the OS to fully release the port instead of a fixed sleep.
		// The previous 50ms sleep was insufficient on some systems.
		if err := waitForPortRelease(listenPort, portReleaseTimeout); err != nil {
			slog.Warn("[Server] port may not be fully released", "port", listenPort, "error", err)
		}
	}

	slog.Info("[Server] starting", "addr", addr, "devMode", s.config.DevMode)
	return s.app.Listen(addr)
}

// fileExists returns true when the path exists and is a regular file.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// waitForPortRelease polls until the given port is free or the timeout expires.
func waitForPortRelease(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	for time.Now().Before(deadline) {
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			ln.Close()
			return nil
		}
		time.Sleep(portReleasePollInterval)
	}
	return fmt.Errorf("port %d not released within %v", port, timeout)
}

// Shutdown gracefully shuts down the server.
// Sets shuttingDown flag first so /health returns "shutting_down"
// before services are torn down, giving the frontend time to notice.
//
// Shutdown is idempotent (#6478): subsequent calls are no-ops. Previously a
// second call panicked with "close of closed channel" when close(s.done)
// was invoked a second time.
func (s *Server) Shutdown() error {
	var shutdownErr error
	s.shutdownOnce.Do(func() {
		atomic.StoreInt32(&s.shuttingDown, 1)

		// Signal background goroutines (orbit scheduler, etc.) to stop.
		close(s.done)

		// If Shutdown is called before Start, the temporary loading server
		// is still running and holding the port. Shut it down first.
		if s.loadingSrv != nil {
			ctx, cancel := context.WithTimeout(context.Background(), serverHealthTimeout)
			defer cancel()
			s.loadingSrv.Shutdown(ctx)
			s.loadingSrv = nil
		}

		if s.gpuUtilWorker != nil {
			s.gpuUtilWorker.Stop()
		}
		s.hub.Close()
		// #10007 — stop the periodic cluster group cache refresh goroutine.
		if s.workloadHandlers != nil {
			s.workloadHandlers.StopCacheRefresh()
		}
		// stop the rewards eviction goroutine (goroutine leak prevention).
		if s.rewardsHandler != nil {
			s.rewardsHandler.StopEviction()
		}
		// stop the operator cache and GitHub proxy limiter eviction goroutines.
		handlers.StopOperatorCacheEvictor()
		handlers.StopGitHubProxyLimiterEvictor()
		// #7043 — stop the SSE cache evictor goroutine that was started
		// lazily by sseCacheSet. Without this the goroutine leaks after
		// server shutdown.
		handlers.StopSSECacheEvictor()
		// #6578 — stop the token revocation cleanup goroutine so tests
		// and embedded usage don't leak it across Server lifecycles.
		middleware.ShutdownTokenRevocation()
		if s.k8sClient != nil {
			s.k8sClient.StopWatching()
		}
		if s.bridge != nil {
			if err := s.bridge.Stop(); err != nil {
				slog.Error("[Server] MCP bridge shutdown error", "error", err)
			}
		}
		if err := s.store.Close(); err != nil {
			shutdownErr = err
			return
		}
		shutdownErr = s.app.Shutdown()
	})
	return shutdownErr
}

func customErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"error": message,
	})
}

// devSecretBytes is the number of random bytes used to generate a dev secret (32 bytes = 256 bits).
const devSecretBytes = 32

// devSecretFile is the filename used to persist the auto-generated JWT secret
// across dev-mode restarts (#6850). The file is created in the working directory
// and should be gitignored.
const devSecretFile = ".jwt-secret"

// sharedSecretDir is the user-level config directory where the JWT secret is
// also persisted so it survives across fresh curl-install runs (#8202).
const sharedSecretDir = ".kubestellar"

// loadOrCreateDevSecret checks two locations for an existing JWT secret:
// first the local working directory (explicit override), then the shared
// ~/.kubestellar/ dir (survives reinstalls). If neither exists, it generates
// a new secret and writes to both locations.
func loadOrCreateDevSecret() string {
	localPath := filepath.Join(".", devSecretFile)
	sharedPath := sharedSecretPath()

	for _, p := range []string{localPath, sharedPath} {
		if p == "" {
			continue
		}
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		secret := strings.TrimSpace(string(data))
		if len(secret) >= devSecretBytes {
			slog.Info("Loaded persisted dev JWT secret", "path", p)
			if p == sharedPath {
				persistSecret(localPath, secret)
			}
			return secret
		}
		slog.Warn("Existing secret file is too short, skipping", "path", p)
	}

	secret := generateRandomSecret()

	persistSecret(localPath, secret)
	if sharedPath != "" {
		persistSecret(sharedPath, secret)
	}

	return secret
}

func sharedSecretPath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, sharedSecretDir, devSecretFile)
}

func persistSecret(path, secret string) {
	const secretFilePerms = 0o600
	const secretDirPerms = 0o700
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, secretDirPerms); err != nil {
		slog.Warn("Could not create directory for JWT secret", "dir", dir, "error", err)
		return
	}
	if err := fileutil.AtomicWriteFile(path, []byte(secret+"\n"), secretFilePerms); err != nil {
		slog.Warn("Could not persist dev JWT secret", "path", path, "error", err)
	} else {
		slog.Info("Persisted dev JWT secret", "path", path)
	}
}

// generateRandomSecret produces a cryptographically random hex string for use
// as a JWT signing secret.
func generateRandomSecret() string {
	b := make([]byte, devSecretBytes)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand.Read should never fail on supported platforms;
		// if it does, fall back to a logged warning and a best-effort value.
		slog.Error("[Server] crypto/rand.Read failed, using fallback", "error", err)
		return fmt.Sprintf("dev-fallback-%d", b)
	}
	return hex.EncodeToString(b)
}

// gitFallbackRevision returns the current git HEAD SHA by shelling out to git.
// Used as a fallback when debug.ReadBuildInfo() doesn't include VCS metadata
// (e.g. when running with `go run` outside a module-aware build).
func gitFallbackRevision() string {
	const gitCmdTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitCmdTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "rev-parse", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// gitFallbackTime returns the commit time of HEAD by shelling out to git.
// Used as a fallback when debug.ReadBuildInfo() doesn't include VCS metadata.
func gitFallbackTime() string {
	const gitCmdTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitCmdTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "log", "-1", "--format=%cI").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// detectInstallMethod returns how the console was installed: dev, binary, or helm.
func detectInstallMethod(inCluster bool) string {
	if inCluster {
		return "helm"
	}
	if _, err := os.Stat("go.mod"); err == nil {
		return "dev"
	}
	return "binary"
}
