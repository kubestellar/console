# Stage 1: Build the kc-agent binary
FROM golang:1.26.5-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /kc-agent ./cmd/kc-agent

# Stage 2: Minimal runtime image
FROM alpine:3.22@sha256:310c62b5e7ca5b08167e4384c68db0fd2905dd9c7493756d356e893909057601

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
