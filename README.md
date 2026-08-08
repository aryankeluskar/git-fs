# GitFS

Replace `github.com` with `github.soy.run` on any GitHub URL and instantly chat with that repo through an AI agent.

GitFS hydrates a virtual filesystem from GitHub's API fakes a bash shell to explore it (`grep`, `cat`, `ls`, `find`) so you can run coding agents completely in your browser. File contents load lazily from GitHub on demand.

<img alt="image" src="https://github.com/aryankeluskar/git-fs/blob/master/public/banner.png?raw=true" />

<img width="1200" height="854" alt="image" src="https://github.com/user-attachments/assets/8418a284-5630-40a3-b6a5-a3ac6b69cc41" />


## Virtual Filesystem (primary)

```
Browser
  ├── just-bash (TypeScript bash reimplementation)
  │     └── InMemoryFs = hydrated from GitHub Git Trees API
  └── pi-agent-core (agent loop)
        └── pi-ai (model streaming: Copilot / Codex / Claude)
```

The agent runs in the browser. The Worker never touches user tokens — it just forwards API requests with the right headers so OAuth subscription tokens (Copilot, Codex, Claude Code) work from a browser context.

<img width="1200" height="771" alt="image" src="https://github.com/user-attachments/assets/dc0f979e-6907-46b6-a034-3cfc07f556f0" />

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
