# Build stage - Backend
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o console ./cmd/console

# Build stage - Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Build arg for commit hash
ARG COMMIT_HASH=unknown

# Copy package files
COPY web/package*.json ./
RUN npm ci

# Copy source
COPY web/ ./

# Build with commit hash
ENV VITE_COMMIT_HASH=${COMMIT_HASH}
RUN npm run build

# Final stage
FROM alpine:3.20

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Copy backend binary
COPY --from=backend-builder /app/console .

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
