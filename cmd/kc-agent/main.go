package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/kubestellar/console/pkg/agent"
)

func main() {
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
		log.Fatalf("Failed to create server: %v", err)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\nShutting down...")
		os.Exit(0)
	}()

	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
