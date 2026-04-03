package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/kubestellar/console/pkg/agent"
)

func main() {
	// Set up structured logging — JSON for production, human-readable text for dev.
	var logHandler slog.Handler
	if os.Getenv("DEV_MODE") == "true" {
		logHandler = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug})
	} else {
		logHandler = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	}
	slog.SetDefault(slog.New(logHandler))

	port := flag.Int("port", 8585, "Port to listen on")
	kubeconfig := flag.String("kubeconfig", "", "Path to kubeconfig file")
	allowedOrigins := flag.String("allowed-origins", "", "Comma-separated list of additional allowed WebSocket origins")
	version := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *version {
		fmt.Printf("kc-agent version %s\n", agent.Version)
		os.Exit(0)
	}

	fmt.Printf(`
 _  __   ____
| |/ /  / ___|
| ' /  | |
| . \  | |___
|_|\_\  \____|

KubeStellar Console - Local Agent v%s
`, agent.Version)

	// Parse comma-separated allowed origins from flag
	var origins []string
	if *allowedOrigins != "" {
		for _, o := range strings.Split(*allowedOrigins, ",") {
			if trimmed := strings.TrimSpace(o); trimmed != "" {
				origins = append(origins, trimmed)
			}
		}
	}

	server, err := agent.NewServer(agent.Config{
		Port:           *port,
		Kubeconfig:     *kubeconfig,
		AllowedOrigins: origins,
	})
	if err != nil {
		slog.Error(fmt.Sprintf("Failed to create server: %v", err))
		os.Exit(1)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\nShutting down...")
		os.Exit(0)
	}()

	if err := server.Start(); err != nil {
		slog.Error(fmt.Sprintf("Server error: %v", err))
		os.Exit(1)
	}
}
