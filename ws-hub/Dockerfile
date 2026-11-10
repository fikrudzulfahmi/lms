# Build: docker build -t lms-ws-hub ./ws-hub
# Never publish this port to the host: attach the container to the internal
# LMS docker network and let Caddy / Cloudflare Tunnel route /ws to it.

FROM golang:1.23-alpine AS builder

WORKDIR /src

ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOFLAGS=-trimpath

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

ARG VERSION=1.0.0
RUN go build -ldflags="-s -w -X main.buildVersion=${VERSION}" -o /out/ws-hub .

FROM alpine:3.20

RUN addgroup -S app && adduser -S -G app app

COPY --from=builder /out/ws-hub /usr/local/bin/ws-hub

USER app
EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -qO- http://127.0.0.1:8081/healthz >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/ws-hub"]
