# SpaceTraders Agent

A Claude Code-powered chat UI for automating your [SpaceTraders.io](https://spacetraders.io) account. Type natural-language commands; Claude calls SpaceTraders API tools directly or writes Node.js automation scripts.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

```sh
cp .env.example .env
# Edit .env and fill in your ANTHROPIC_API_KEY
```

## Commands

### First run (builds the Docker image)
```sh
docker compose up --build
```

### Subsequent starts
```sh
docker compose up
```

### Stop (credentials are preserved)
```sh
# Ctrl-C to stop, then:
docker compose down
```

### Reset saved account data
> ⚠️ This destroys your saved SpaceTraders token. You will need to re-register.
```sh
docker compose down -v
```

### Force-rebuild the image (e.g. to update Claude Code CLI)
```sh
docker compose build --no-cache
docker compose up
```

## Usage

Open **http://localhost:3000** in your browser.

- If you have no account, fill in the registration form and click **Register Agent**
- Use the quick-action buttons for common commands
- Type anything in the input to give Claude a command
- Claude will call SpaceTraders API tools directly for simple operations, and write/run Node.js scripts for complex automation

## Data persistence

| What | Where | Persists? |
|------|-------|-----------|
| SpaceTraders token & agent info | `agent-data` Docker volume (`/data/config.json`) | Yes — survives restarts |
| Scripts written by Claude | `agent-workspace` Docker volume (`/workspace/`) | Yes — survives restarts |
| Conversation history | In-memory (`InMemorySessionStore`) | No — resets on restart |

## Architecture

- **`src/server.js`** — Express server with Server-Sent Events streaming
- **`src/agent.js`** — Claude Agent SDK integration with in-process MCP tools
- **`src/spacetraders-api.js`** — Rate-limited SpaceTraders API client (1 req/sec)
- **`public/`** — Single-page chat UI
