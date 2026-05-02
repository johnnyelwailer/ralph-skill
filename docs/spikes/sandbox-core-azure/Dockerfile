# Dockerfile: Minimal Sandbox Agent for Container Apps Jobs
# This is a spike container that simulates aloop agent + provider execution
# Input: JSON on stdin with { "provider": "...", "prompt": "..." }
# Output: JSON to stdout with { "result": "...", "provider": "...", "status": "..." }

FROM node:22-alpine

WORKDIR /app

# Install utilities
RUN apk add --no-cache \
    curl \
    jq \
    dumb-init

# Create a simple node app that acts as the agent
COPY agent.js .

# Health check (for debugging; not required for jobs)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run with dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["node", "agent.js"]
