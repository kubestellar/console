# Build stage - Backend
FROM golang:1.26-alpine@sha256:f85330846cde1e57ca9ec309382da3b8e6ae3ab943d2739500e08c86393a21b1 AS backend-builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build args for version and target architecture
ARG APP_VERSION=dev
ARG TARGETARCH

# Build for the target platform (TARGETARCH is set automatically by buildx)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -ldflags="-s -w -X github.com/kubestellar/console/pkg/api.Version=${APP_VERSION}" -o console ./cmd/console
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -ldflags="-s -w -X main.version=${APP_VERSION}" -o kc-watcher ./cmd/watcher

# Build stage - Frontend
FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS frontend-builder

WORKDIR /app

# Build args for version and commit hash
ARG APP_VERSION=0.0.0
ARG COMMIT_HASH=unknown

# Cache npm dependencies independently of source changes.
# Install dependencies first so that the npm ci layer is reused whenever
# package.json / package-lock.json are unchanged, even if other source files
# differ. This is especially valuable for QEMU arm64 builds.
COPY web/package.json web/package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy the rest of the frontend source.
# WARNING (local builds): if web/dist/ is present in your working tree from a
# previous build it will be copied here and the conditional below will skip
# Vite, silently shipping stale assets. Remove web/dist/ before building
# locally if you want a fresh frontend build.
# In CI this is not a risk: the checkout is clean and dist/ is only present
# here when the build-frontend job explicitly downloaded the artifact.
COPY web/ ./

# Build only if dist/ was not pre-built by CI
RUN if [ -d dist ] && [ -n "$(ls -A dist 2>/dev/null)" ]; then \
      echo "Using pre-built frontend dist/"; \
    else \
      VITE_APP_VERSION=${APP_VERSION} VITE_COMMIT_HASH=${COMMIT_HASH} npm run build; \
    fi

# Final stage
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Copy backend and watcher binaries
COPY --from=backend-builder /app/console .
COPY --from=backend-builder /app/kc-watcher .

# Copy frontend build
COPY --from=frontend-builder /app/dist ./web/dist

# Create non-root user for container security
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

# Create data and settings directories
RUN mkdir -p /app/data /app/.kc && chown -R appuser:appgroup /app/data /app/.kc

# Copy entrypoint script for watchdog + backend
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Environment variables
ENV PORT=8080
ENV BACKEND_PORT=8081
ENV DATABASE_PATH=/app/data/console.db
ENV HOME=/app

EXPOSE 8080

# Health check hits the watchdog, which always responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/watchdog/health || exit 1

# Run as non-root user
USER appuser

ENTRYPOINT ["./entrypoint.sh"]
