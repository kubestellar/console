package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/kubestellar/console/pkg/agent"
)

func main() {
	port := flag.Int("port", 8585, "Port to listen on")
	kubeconfig := flag.String("kubeconfig", "", "Path to kubeconfig file")
	version := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *version {
		fmt.Printf("kkc-agent version %s\n", agent.Version)
		os.Exit(0)
	}

	fmt.Println(`
 _    _                                    _
| | _| | _____       __ _  __ _  ___ _ __ | |_
| |/ / |/ / __|____ / _` + "`" + ` |/ _` + "`" + ` |/ _ \ '_ \| __|
|   <|   < (__/___ | (_| | (_| |  __/ | | | |_
|_|\_\_|\_\___|     \__,_|\__, |\___|_| |_|\__|
                         |___/
KubeStellar Klaude Console - Local Agent
`)

	server, err := agent.NewServer(agent.Config{Port: *port, Kubeconfig: *kubeconfig})
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
