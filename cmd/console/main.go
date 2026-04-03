package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/kubestellar/console/pkg/api"
)

func main() {
	// Load .env file if it exists (silently ignore if not found)
	_ = godotenv.Load()

	// Set up structured logging — JSON for production, human-readable text for dev.
	var logHandler slog.Handler
	if os.Getenv("DEV_MODE") == "true" {
		logHandler = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug})
	} else {
		logHandler = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	}
	slog.SetDefault(slog.New(logHandler))

	// Parse flags
	devMode := flag.Bool("dev", false, "Run in development mode")
	port := flag.Int("port", 0, "Server port (default: 8080)")
	dbPath := flag.String("db", "", "Database path (default: ./data/console.db)")
	watchdog := flag.Bool("watchdog", false, "Run as watchdog reverse proxy (serves fallback page when backend is down)")
	backendPort := flag.Int("backend-port", watchdogDefaultBackendPort, "Backend port for watchdog to proxy to")
	version := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *version {
		fmt.Printf("console version %s\n", api.Version)
		os.Exit(0)
	}

	// Watchdog mode: lightweight reverse proxy, no DB/k8s/MCP initialization
	if *watchdog {
		listenPort := watchdogDefaultListenPort
		if *port > 0 {
			listenPort = *port
		}
		cfg := WatchdogConfig{
			ListenPort:  listenPort,
			BackendPort: *backendPort,
		}
		if err := runWatchdog(cfg); err != nil {
			slog.Error(fmt.Sprintf("Watchdog error: %v", err))
			os.Exit(1)
		}
		return
	}

	// Load config from environment
	cfg := api.LoadConfigFromEnv()

	// Override with flags
	if *devMode {
		cfg.DevMode = true
	}
	if *port > 0 {
		cfg.Port = *port
	}
	if *dbPath != "" {
		cfg.DatabasePath = *dbPath
	}

	// Ensure data directory exists
	if cfg.DatabasePath != "" {
		ensureDir(cfg.DatabasePath)
	}

	// Create and start server — starts HTTP listener immediately with a loading
	// page, then initializes services (DB, k8s, MCP, etc.) in the background.
	server, err := api.NewServer(cfg)
	if err != nil {
		slog.Error(fmt.Sprintf("Failed to create server: %v", err))
		os.Exit(1)
	}

	// Handle graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		slog.Info("Shutting down...")
		if err := server.Shutdown(); err != nil {
			slog.Error(fmt.Sprintf("Shutdown error: %v", err))
		}
		os.Exit(0)
	}()

	// Block until shutdown (HTTP listener runs in background from NewServer)
	if err := server.Start(); err != nil {
		slog.Error(fmt.Sprintf("Server error: %v", err))
		os.Exit(1)
	}
}

func ensureDir(path string) {
	// Extract directory from path
	dir := path
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			dir = path[:i]
			break
		}
	}
	if dir != path && dir != "" {
		os.MkdirAll(dir, 0755)
	}
}
