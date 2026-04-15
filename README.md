# GitSandbox

Ask any GitHub repo from your browser. Enter a repository URL, and GitSandbox spins up a Cloudflare Sandbox with an AI coding agent (OpenCode or Pi) — all through an xterm.js terminal in the browser.

<img alt="image" src="https://github.com/aryankeluskar/gitsandbox/blob/master/public/banner.png?raw=true" />

## Architecture

```
Browser (React SPA) <──> Cloudflare Worker (Hono) <──> Sandbox Container (PTY)
```

- **Frontend**: React + Vite + Tailwind CSS, deployed to Cloudflare Pages
- **Backend**: Hono on Cloudflare Workers with Sandbox SDK binding
- **Terminal**: xterm.js with `@cloudflare/sandbox/xterm` SandboxAddon
- **Storage**: Dexie (IndexedDB) for sessions, credentials, and usage tracking

## Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Docker](https://docs.docker.com/desktop/) (for local sandbox development)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (v4+, installed as dev dependency)
- A Cloudflare account on the Workers Paid plan

## Getting Started

```bash
# Install dependencies
bun install

# Start the worker (needs Docker running)
bun run dev:worker

# In another terminal, start the frontend
bun run dev:web
```

Open [http://localhost:3000](http://localhost:3000) and enter a GitHub repo URL to get started.

## Project Structure

```
gitsandbox/
  packages/
    worker/          # Cloudflare Worker (Hono + Sandbox SDK)
      src/
        index.ts     # Hono router with /sandbox/create, /sandbox/destroy, /ws/terminal
        sandbox.ts   # Sandbox lifecycle management
        repo.ts      # GitHub URL parsing and tarball URL builder
        types.ts     # Shared TypeScript types
      Dockerfile     # Sandbox container image
      wrangler.jsonc # Worker + Sandbox configuration
    web/             # React SPA (Cloudflare Pages)
      src/
        components/  # RepoInput, TerminalView, SessionSidebar, SettingsPanel, UsageBadge
        db/          # Dexie schema and CRUD helpers
        hooks/       # useSandbox, useTerminal, useSettings
        lib/         # parseRepoUrl, estimateCost, api client
  package.json       # Bun workspaces root
```

## API


| Method | Path                          | Purpose                                 |
| ------ | ----------------------------- | --------------------------------------- |
| POST   | `/sandbox/create`             | Create sandbox, clone repo, start agent |
| POST   | `/sandbox/destroy`            | Terminate sandbox                       |
| GET    | `/ws/terminal?id={sandboxId}` | WebSocket PTY proxy                     |
| GET    | `/health`                     | Liveness check                          |


## Deploying

```bash
# Deploy the worker
bun run deploy:worker

# Build and deploy the frontend
bun run --filter=@gitsandbox/web build
bun run deploy:web
```

## Running Tests

```bash
bun run test
```

## Credentials

All API keys are stored in the browser's IndexedDB (via Dexie). They are passed to the sandbox container as environment variables at creation time and never persisted by the worker.