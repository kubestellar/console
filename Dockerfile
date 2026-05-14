# Build stage - Backend
FROM golang:1.26.3-alpine@sha256:91eda9776261207ea25fd06b5b7fed8d397dd2c0a283e77f2ab6e91bfa71079d AS backend-builder

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

# Build stage - MCP binaries
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc AS mcp-binaries

ARG TARGETARCH
ARG KUBESTELLAR_MCP_RELEASE_TAG=v0.8.18-nightly.20260509
# SHA256 checksums for linux/amd64 tarballs (update when bumping KUBESTELLAR_MCP_RELEASE_TAG)
ARG OPS_SHA256_AMD64="ee199aed870a074d056045e18ea0efb89af0dd817b502e8b1e2157608bd0efd2"
ARG DEPLOY_SHA256_AMD64="f49e94bce3157bd7ed450fabcc6bff8a72bc41f19735740f6b89717a3f0dc225"
# SHA256 checksums for linux/arm64 tarballs
ARG OPS_SHA256_ARM64="264678618b30a178eed02488b3c74afd49b4a85f68b474d9ae9aae2b19ba0b23"
ARG DEPLOY_SHA256_ARM64="65d4ca235e494a1a29345d28b65c8e46c66bd65c5101f1ca0a4c1bf8b83880a8"

RUN set -eux; \
    apk add --no-cache ca-certificates curl tar; \
    case "${TARGETARCH}" in \
      amd64) mcp_arch="amd64"; ops_sha="${OPS_SHA256_AMD64}"; deploy_sha="${DEPLOY_SHA256_AMD64}" ;; \
      arm64) mcp_arch="arm64"; ops_sha="${OPS_SHA256_ARM64}"; deploy_sha="${DEPLOY_SHA256_ARM64}" ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    release_version="${KUBESTELLAR_MCP_RELEASE_TAG#v}"; \
    base_url="https://github.com/kubestellar/kubestellar-mcp/releases/download/${KUBESTELLAR_MCP_RELEASE_TAG}"; \
    mkdir -p /out; \
    curl -fsSL "${base_url}/kubestellar-ops_${release_version}_linux_${mcp_arch}.tar.gz" -o /out/kubestellar-ops.tar.gz; \
    echo "${ops_sha}  /out/kubestellar-ops.tar.gz" | sha256sum -c -; \
    tar -xzf /out/kubestellar-ops.tar.gz -C /out kubestellar-ops; \
    curl -fsSL "${base_url}/kubestellar-deploy_${release_version}_linux_${mcp_arch}.tar.gz" -o /out/kubestellar-deploy.tar.gz; \
    echo "${deploy_sha}  /out/kubestellar-deploy.tar.gz" | sha256sum -c -; \
    tar -xzf /out/kubestellar-deploy.tar.gz -C /out kubestellar-deploy; \
    rm /out/kubestellar-ops.tar.gz /out/kubestellar-deploy.tar.gz; \
    chmod +x /out/kubestellar-ops /out/kubestellar-deploy

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

# Copy MCP helper binaries used by the in-cluster bridge
COPY --from=mcp-binaries /out/kubestellar-ops /usr/local/bin/kubestellar-ops
COPY --from=mcp-binaries /out/kubestellar-deploy /usr/local/bin/kubestellar-deploy

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
