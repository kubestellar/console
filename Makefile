# KubeStellar Console — developer workflow targets
#
# Usage:
#   make update    Pull latest, build everything, restart
#   make build     Build frontend + Go binaries
#   make restart   Restart all processes via startup-oauth.sh
#   make help      Show available targets

.PHONY: help build restart update pull lint

SHELL := /bin/bash

## help: Show this help message
help:
	@echo "Usage: make <target>"
	@echo ""
	@sed -n 's/^## //p' $(MAKEFILE_LIST) | column -t -s ':' | sed 's/^/  /'

## pull: Pull latest changes from main
pull:
	git pull --rebase origin main

## build: Build frontend and Go binaries
build:
	cd web && npm install --prefer-offline && npm run build
	mkdir -p bin
	go build -o bin/kc-agent ./cmd/kc-agent
	go build -o bin/console ./cmd/console
	@# Update Homebrew kc-agent if installed
	@if command -v kc-agent >/dev/null 2>&1; then cp bin/kc-agent $$(which kc-agent) 2>/dev/null || true; fi

## restart: Restart all processes (kc-agent, backend, frontend)
restart:
	bash startup-oauth.sh

## update: Pull, build, and restart (full update cycle)
update: pull build restart

## lint: Run frontend linter
lint:
	cd web && npm run lint
