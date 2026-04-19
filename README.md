# GitFS

Replace `github.com` with `github.soy.run` on any GitHub URL and instantly chat with that repo through an AI agent. No clone, no container, no MCP.

GitFS hydrates a virtual filesystem from GitHub's API and gives an agent a bash shell to explore it — `grep`, `cat`, `ls`, `find` work instantly because the filesystem is in-memory. File contents load lazily from GitHub on demand.

<img alt="image" src="https://github.com/aryankeluskar/git-fs/blob/master/public/banner.png?raw=true" />


## Virtual Filesystem (primary)

```
Browser
  ├── just-bash (TypeScript bash reimplementation)
  │     └── InMemoryFs = hydrated from GitHub Git Trees API
  └── pi-agent-core (agent loop)
        └── pi-ai (model streaming: Copilot / Codex / Claude)
```

The agent runs in the browser. The Worker never touches user tokens — it just forwards API requests with the right headers so OAuth subscription tokens (Copilot, Codex, Claude) work from a browser context.

## Account-Level Queries

GitFS supports org/user-level exploration. Navigating to `github.soy.run/cloudflare` builds a skeleton filesystem with a `/README.md` manifest and per-repo `/.repo-meta.json` stubs. The agent can answer questions about what repos exist, their languages, stars, and descriptions — without loading any source code.

## Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Docker](https://docs.docker.com/desktop/) (for local sandbox development)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (v4+, installed as dev dependency)
- A Cloudflare account on the Workers Paid plan

## Getting Started

```bash
# Install dependencies
bun install

# Start the worker (needs Docker running for sandbox mode)
bun run dev:worker

# In another terminal, start the frontend
bun run dev:web
```

Open [http://localhost:3000](http://localhost:3000) and enter a GitHub repo URL to get started.

## Project Structure

```
gitfs/
  packages/
    worker/            # Cloudflare Worker (Hono + Sandbox SDK)
      src/
        index.ts       # Hono router: sandbox CRUD, API proxies, OAuth flows
        sandbox.ts     # Sandbox lifecycle + OpenCode proxy
        repo.ts        # GitHub URL parsing and tarball URL builder
        types.ts       # Shared TypeScript types
      Dockerfile       # Sandbox container: Ubuntu + Node + OpenCode
      wrangler.jsonc   # Worker + Sandbox + Durable Object config
    web/               # React SPA (Cloudflare Pages)
      src/
        components/    # RepoInput, ChatView, ChatComposer, ChatMessage,
                       # SessionSidebar, SettingsPanel, ModelProviderPicker,
                       # BranchPicker, AuthPrompt, ToolCard, UsageBadge, …
        db/            # Dexie schema: sessions, messages, credentials, usage
        hooks/         # useAgent, useSettings
        lib/           # githubFs, repoRuntime, agent, tools,
                       # claudeOAuth, copilotOAuth, codexOAuth,
                       # githubAuth, githubAccount, parseRepoUrl, …
  package.json         # Bun workspaces root
```


## Deploying

```bash
# Deploy the worker
bun run deploy:worker

# Build and deploy the frontend
bun run --filter=@gitfs/web build
bun run deploy:web
```

## Running Tests

```bash
bun run test
```
