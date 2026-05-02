# Multi-stage: Node + Playwright browsers + .NET 9 SDK
# Resulting image: ~2.8 GB (spike only; production would slim this)
FROM mcr.microsoft.com/playwright:v1.50.1-noble

# ── .NET 9 SDK (via official install script — works on all Ubuntu variants) ───
ENV DOTNET_ROOT=/usr/local/dotnet
ENV PATH="$PATH:/usr/local/dotnet"
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- \
        --channel 9.0 \
        --install-dir /usr/local/dotnet && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Node app ──────────────────────────────────────────────────────────────────
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Install Playwright browser binaries (Chromium only for size)
RUN npx playwright install chromium --with-deps

COPY server.js ./

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:8080/health > /dev/null || exit 1

CMD ["node", "server.js"]
