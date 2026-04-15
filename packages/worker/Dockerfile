FROM docker.io/cloudflare/sandbox:0.7.21

RUN apt-get update && \
    apt-get install -y --no-install-recommends git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g opencode-ai && \
    npm cache clean --force && \
    rm -rf /tmp/* /root/.npm

# Pre-run the SQLite migration so sandboxes don't hit it on first boot.
# `opencode --version` triggers the migration without starting a server.
RUN opencode --version || true

EXPOSE 4096

WORKDIR /workspace
