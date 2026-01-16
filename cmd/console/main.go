package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/kubestellar/console/pkg/api"
)

func main() {
	// Parse flags
	devMode := flag.Bool("dev", false, "Run in development mode")
	port := flag.Int("port", 0, "Server port (default: 8080)")
	dbPath := flag.String("db", "", "Database path (default: ./data/console.db)")
	flag.Parse()

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

	// Create and start server
	server, err := api.NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	// Handle graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		log.Println("Shutting down...")
		if err := server.Shutdown(); err != nil {
			log.Printf("Shutdown error: %v", err)
		}
		os.Exit(0)
	}()

	// Start server
	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
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
