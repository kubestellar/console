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

	// Blank-import federation providers so their init() funcs register them.
	_ "github.com/kubestellar/console/pkg/agent/federation/providers"
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

	slog.Info("KubeStellar Console - Local Agent starting", "version", agent.Version)

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
		slog.Error("failed to create server", "error", err)
		os.Exit(1)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		slog.Info("Shutting down — waiting for in-flight cluster operations")
		server.GracefulShutdown()
		os.Exit(0)
	}()

	if err := server.Start(); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
