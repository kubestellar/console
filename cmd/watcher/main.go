package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"runtime/debug"
	"strconv"

	"github.com/joho/godotenv"
)

// version is overridden at build time via -ldflags "-X main.version=..."
var version = "dev"

func getBuildRevision() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	for _, s := range info.Settings {
		if s.Key == "vcs.revision" {
			return s.Value
		}
	}
	return ""
}

func main() {
	_ = godotenv.Load()

	var logHandler slog.Handler
	if os.Getenv("DEV_MODE") == "true" {
		logHandler = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug})
	} else {
		logHandler = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	}
	slog.SetDefault(slog.New(logHandler))

	port := flag.Int("port", watcherDefaultListenPort, "Listen port")
	backendPort := flag.Int("backend-port", watcherDefaultBackendPort, "Backend port to proxy to")
	tlsEnabled := flag.Bool("tls", false, "Enable HTTPS/H2 (auto-generates self-signed cert)")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		rev := getBuildRevision()
		out := "kc-watcher version " + version
		if rev != "" {
			hashLen := watcherGitShortHashLen
			if len(rev) > hashLen {
				rev = rev[:hashLen]
			}
			out += " (" + rev + ")"
		}
		fmt.Println(out) //nolint:forbidigo // CLI --version flag output
		os.Exit(0)
	}

	slog.Info("kc-watcher starting", "version", version, "port", strconv.Itoa(*port), "backend-port", strconv.Itoa(*backendPort))

	cfg := WatcherConfig{
		ListenPort:  *port,
		BackendPort: *backendPort,
		TLS:         *tlsEnabled,
	}
	if err := runWatcher(cfg); err != nil {
		slog.Error("watcher error", "error", err)
		os.Exit(1)
	}
}
