package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/kubestellar/console/pkg/watcher"
)

const (
	pidFile          = "/tmp/.kc-watchdog.pid"
	stageFile        = "/tmp/.kc-startup-stage"
	gitLookupTimeout = 2 * time.Second
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

func resolveGitCommitShort() string {
	ctx, cancel := context.WithTimeout(context.Background(), gitLookupTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "--short="+strconv.Itoa(watcher.GitShortHashLen), "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
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

	port := flag.Int("port", watcher.DefaultListenPort, "Listen port")
	backendPort := flag.Int("backend-port", watcher.DefaultBackendPort, "Backend port to proxy to")
	tlsEnabled := flag.Bool("tls", false, "Enable HTTPS/H2 (auto-generates self-signed cert)")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		rev := getBuildRevision()
		out := "kc-watcher version " + version
		if rev != "" {
			hashLen := watcher.GitShortHashLen
			if len(rev) > hashLen {
				rev = rev[:hashLen]
			}
			out += " (" + rev + ")"
		}
		fmt.Println(out) //nolint:forbidigo
		os.Exit(0)
	}

	slog.Info("kc-watcher starting", "version", version, "port", strconv.Itoa(*port), "backend-port", strconv.Itoa(*backendPort))

	runtimeState, cleanupRuntime, err := watcher.PrepareRuntime(watcher.RuntimeInfoFile)
	if err != nil {
		slog.Error("failed to prepare watcher runtime", "error", err)
		os.Exit(1)
	}
	defer cleanupRuntime()

	gitCommit := getBuildRevision()
	if gitCommit != "" {
		if len(gitCommit) > watcher.GitShortHashLen {
			gitCommit = gitCommit[:watcher.GitShortHashLen]
		}
	} else {
		gitCommit = resolveGitCommitShort()
	}

	cfg := watcher.Config{
		ListenPort:  *port,
		BackendPort: *backendPort,
		TLS:         *tlsEnabled,
		PidFile:     runtimeState.PidFile,
		StageFile:   runtimeState.StageFile,
		Version:     version,
		GitCommit:   gitCommit,
	}
	if err := watcher.Run(cfg); err != nil {
		slog.Error("watcher error", "error", err)
		os.Exit(1)
	}
}
