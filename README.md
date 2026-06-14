# SpaceTraders Agent

A Claude Code-powered chat UI for automating your [SpaceTraders.io](https://spacetraders.io) account. Type natural-language commands; Claude calls SpaceTraders API tools directly or writes Node.js automation scripts.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

You need two API keys — one for Anthropic, one for SpaceTraders.

**Anthropic API key** — from [console.anthropic.com](https://console.anthropic.com).

**SpaceTraders account token** — this authorizes agent registration:
1. Go to [https://my.spacetraders.io](https://my.spacetraders.io) and sign in (or create a free account).
2. Copy your **account token** from your account settings.

Add both to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
SPACETRADERS_TOKEN=<your account token>
```

On first launch the app will show a registration form. Enter an agent name, click **Register Agent**, and the app will register the agent using your account token and save the returned agent token for the session.

## Starting the app

To start the app, add the Anthropic API key that the app will use to call the [Claude Code Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) to the `.env` file along with your SpaceTraders account token.
Then, run the startup command:

```sh
docker compose up --build
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

- Use the quick-action buttons for common commands
- Type anything in the input to give Claude a command
- Claude will call SpaceTraders API tools directly for simple operations, and write/run Node.js scripts for complex automation

## Data persistence

| What | Where | Persists? |
|------|-------|-----------|
| SpaceTraders token & agent info | `agent-data` Docker volume (`/data/config.json`) | Yes — survives restarts |
| Scripts written by Claude | `./workspace/` (local folder in this repo) | Yes — browse in Finder or any editor |
| Conversation history | In-memory (`InMemorySessionStore`) | No — resets on restart |

Scripts in `./workspace/` are stored directly on your Mac — open them in any editor or Finder even when the container is stopped. They persist across `docker compose down` / `docker compose up` cycles and are only lost if you manually delete the folder.

The `agent-data` volume (SpaceTraders token) is still a Docker named volume and is only deleted with `docker compose down -v`, which also requires re-registration.

## Architecture

- **`src/server.js`** — Express server with Server-Sent Events streaming
- **`src/agent.js`** — Claude Agent SDK integration with in-process MCP tools
- **`src/spacetraders-api.js`** — Rate-limited SpaceTraders API client (1 req/sec)
- **`public/`** — Single-page chat UI
