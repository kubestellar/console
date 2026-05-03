# Stage 1: Build the kc-agent binary
FROM golang:1.25-alpine@sha256:5caaf1cca9dc351e13deafbc3879fd4754801acba8653fa9540cea125d01a71f AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /kc-agent ./cmd/kc-agent

# Stage 2: Minimal runtime image
FROM alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d

RUN apk add --no-cache ca-certificates

COPY --from=builder /kc-agent /usr/local/bin/kc-agent

EXPOSE 8585

ENTRYPOINT ["kc-agent"]
CMD []

LABEL org.opencontainers.image.source="https://github.com/kubestellar/console" \
      org.opencontainers.image.title="kc-agent" \
      org.opencontainers.image.description="KubeStellar Console MCP server — bridges browser to kubeconfig and MCP-capable AI providers"
