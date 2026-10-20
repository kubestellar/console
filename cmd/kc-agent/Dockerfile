# Stage 1: Build the kc-agent binary
# Base images are overridable so CI can fall back to docker.io mirrors
# (same digests) when public.ecr.aws returns 429 Too Many Requests.
ARG GOLANG_BASE=public.ecr.aws/docker/library/golang:1.27.2-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d
ARG ALPINE_BASE=public.ecr.aws/docker/library/alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

FROM ${GOLANG_BASE} AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /kc-agent ./cmd/kc-agent

# Stage 2: Minimal runtime image
FROM ${ALPINE_BASE}

RUN apk add --no-cache ca-certificates \
    && addgroup -g 65532 -S nonroot \
    && adduser -u 65532 -S nonroot -G nonroot

# CA trust bundle refresh: distrust a Mozilla root the browser/OS root programs
# withdrew on 2026-10-17..20 that Alpine's ca-certificates package still ships
# (no fixed package yet — drop this once the package carries the change). The
# Go binaries read /etc/ssl/certs/ca-certificates.crt, so regenerating it here
# is what changes their trust. The grep/test make a renamed upstream entry fail
# the build instead of silently re-trusting.
RUN sed -i -e 's|^mozilla/emSign_ECC_Root_CA_-_G3.crt|!&|' /etc/ca-certificates.conf \
    && grep -q '^!mozilla/emSign_ECC_Root_CA_-_G3.crt' /etc/ca-certificates.conf \
    && update-ca-certificates --fresh \
    && ! test -e /etc/ssl/certs/ca-cert-emSign_ECC_Root_CA_-_G3.pem

COPY --from=builder /kc-agent /usr/local/bin/kc-agent

EXPOSE 8585

USER nonroot:nonroot

ENTRYPOINT ["kc-agent"]
CMD []

LABEL org.opencontainers.image.source="https://github.com/kubestellar/console" \
      org.opencontainers.image.title="kc-agent" \
      org.opencontainers.image.description="KubeStellar Console MCP server — bridges browser to kubeconfig and MCP-capable AI providers"
