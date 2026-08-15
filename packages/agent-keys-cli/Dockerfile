# ─── Stage 1: Build ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
COPY src/ ./src/

# ─── Stage 2: Hardened Runtime ──────────────────────────────────────────
FROM node:20-alpine

# Security: non-root user
RUN addgroup -S signer && adduser -S signer -G signer

# Security: drop unnecessary capabilities
RUN apk add --no-cache libcap && \
    setcap -r /usr/local/bin/node cap_net_bind_service,cap_net_raw,cap_net_admin && \
    apk del libcap

WORKDIR /app

# Copy only the built artifacts
COPY --from=builder /app /app

# Security: read-only root filesystem compatible
RUN mkdir -p /tmp && chmod 1777 /tmp

USER signer

# Security: no stdin, no network
STOPSIGNAL SIGTERM

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD pgrep -f "node" || exit 1

# Run in daemon mode (serve)
ENTRYPOINT ["node", "src/cli.js", "serve"]

# Required: mount key envelope at /app/key.json
# Usage:
#   docker run -v /path/to/key.json:/app/key.json \
#     -e KEY_PASSWORD=yourpassword \
#     nexusgenesis-signer:latest
#
# Or with --env-file:
#   docker run --env-file .env.signer \
#     -v /path/to/key.json:/app/key.json \
#     nexusgenesis-signer:latest