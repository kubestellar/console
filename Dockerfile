# Build stage - Backend
FROM golang:1.23-alpine AS backend-builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=1 GOOS=linux go build -o console ./cmd/console

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

# Create data directory
RUN mkdir -p /app/data

# Environment variables
ENV PORT=8080
ENV DATABASE_PATH=/app/data/console.db

EXPOSE 8080

ENTRYPOINT ["./console"]
