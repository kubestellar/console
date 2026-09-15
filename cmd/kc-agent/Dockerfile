# Stage 1: Build the kc-agent binary
FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /kc-agent ./cmd/kc-agent

# Stage 2: Minimal runtime image
FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

RUN apk add --no-cache ca-certificates \
    && addgroup -g 65532 -S nonroot \
    && adduser -u 65532 -S nonroot -G nonroot

COPY --from=builder /kc-agent /usr/local/bin/kc-agent

EXPOSE 8585

USER nonroot:nonroot

ENTRYPOINT ["kc-agent"]
CMD []

LABEL org.opencontainers.image.source="https://github.com/kubestellar/console" \
      org.opencontainers.image.title="kc-agent" \
      org.opencontainers.image.description="KubeStellar Console MCP server — bridges browser to kubeconfig and MCP-capable AI providers"
