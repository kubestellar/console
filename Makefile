# KubeStellar Console — developer workflow targets
#
# Usage:
#   make dev       Start frontend, backend, and kc-agent (no OAuth required)
#   make update    Pull latest, build everything, restart
#   make build     Build frontend + Go binaries
#   make restart   Restart all processes via startup-oauth.sh
#   make help      Show available targets

.PHONY: help dev build restart update pull lint analytics-ping

SHELL := /bin/bash

# GA4 Measurement Protocol — anonymous "make update" tracking
# The API secret and Measurement ID are non-sensitive (client-side analytics).
# No PII is collected; only a random client ID and the event name.
GA4_MP_API_SECRET := LpGb3fZkSk2q2d_1hJ8Haw
GA4_MP_MEASUREMENT_ID := G-PXWNVQ8D1T

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

## analytics-ping: Send anonymous "make update" event to GA4 (fire-and-forget)
analytics-ping:
	@# Anonymous ping — no PII, random client ID per machine, fire-and-forget
	@CID=$$(cat ~/.ksc-analytics-cid 2>/dev/null || (uuidgen | tr '[:upper:]' '[:lower:]' | tee ~/.ksc-analytics-cid)); \
	curl -s -o /dev/null --max-time 3 \
	  'https://www.google-analytics.com/mp/collect?measurement_id=$(GA4_MP_MEASUREMENT_ID)&api_secret=$(GA4_MP_API_SECRET)' \
	  -d "{\"client_id\":\"$$CID\",\"events\":[{\"name\":\"ksc_make_update\",\"params\":{\"install_method\":\"dev\",\"commit_sha\":\"$$(git rev-parse --short HEAD 2>/dev/null || echo unknown)\"}}]}" \
	  2>/dev/null || true

## update: Pull, build, restart, and send anonymous analytics ping
update: pull build restart analytics-ping

## dev: Start frontend, backend, and kc-agent for local development (no OAuth required)
dev:
	bash start-dev.sh

## lint: Run frontend linter
lint:
	cd web && npm run lint
