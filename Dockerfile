# Build stage - Backend
FROM golang:1.26-alpine AS backend-builder

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

# Copy package files
COPY web/package*.json web/.npmrc ./
RUN npm ci

# Copy source
COPY web/ ./

# Build with version and commit hash baked into the JS bundle
ENV VITE_APP_VERSION=${APP_VERSION}
ENV VITE_COMMIT_HASH=${COMMIT_HASH}
RUN npm run build

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
