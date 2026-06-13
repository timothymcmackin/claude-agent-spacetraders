FROM node:20-slim

# Install Claude Code CLI (requires Node.js, which we already have)
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src/ ./src/
COPY public/ ./public/

# Create volume mount points owned by the non-root user.
# bypassPermissions mode uses --dangerously-skip-permissions, which Claude
# Code refuses to run as root.
RUN mkdir -p /workspace /data && chown -R node:node /app /workspace /data

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
