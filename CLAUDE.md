# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build frontend (outputs to dist/)
npm run build

# Start backend worker (Cloudflare Workers, port 8787)
npm run dev:worker

# Start frontend dev server (Vite, port 5173)
npm run dev:frontend

# Deploy to Cloudflare Workers
npx wrangler deploy
```

## Architecture

### Backend — Cloudflare Workers (Hono + Vercel AI SDK)

- **`src/routes/compare.ts`** — Single SSE endpoint `POST /api/compare`. Two-phase flow:
  1. **Phase 1**: Parallel repo analysis via `streamRepoAgent` (Promise.all). Each repo streams `progress/text/reasoning` events.
  2. **Phase 2**: After all repos complete, `streamSummary` generates the comparison report.
  - Accumulate `analysisText` from both `text` and `reasoning` channel chunks (MiniMax outputs via reasoning channel).
  - Token usage tracked via `onFinish` callback on `streamText`.

- **`src/agents/repo-agent.ts`** — `streamRepoAgent` async generator.
  - `fetchRepoData()` — parallel GitHub API calls for metadata (stars, forks, commits, contributors, releases, README).
  - `fetchCodeFiles()` — async generator yielding sub-steps [1/4] through [4/4] for code structure analysis.
  - Uses `streamText` (no tools) to generate analysis text. MiniMax `reasoning_split` mode outputs via `reasoning`/`reasoning-delta` channels, not `text-delta`.
  - Yields: `{type: 'progress'|'text'|'reasoning'|'usage'}`

- **`src/tools/github.ts`** — GitHub API utilities.
  - `fetchFileTree()` — `GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1`
  - `fetchFileContent()` — `GET /repos/{owner}/{repo}/contents/{path}`
  - `fetchCodeFiles()` — async generator, priority-scored file selection + batch fetch with rate limiting
  - `analyzeCodeFiles()` — parses files to extract: language, packageManager, dependencyCount, hasTests, hasLinter, hasCI, hasDocker, hasAPI, topLevelDirs

- **`src/agents/summarizer-agent.ts`** — `streamSummary` async generator. Takes all repo analyses and streams a comparison report via `streamText`.

### Frontend — React + Vite

- **`frontend/src/App.tsx`** — Main component with SSE consumption via `fetch` + `ReadableStream`.
  - `RepoPanel` interface: `repo`, `text`, `reasoning`, `displayedText`, `displayedReasoning`, `logs`, `done`.
  - Streaming: chunks accumulated in refs; `setInterval` at 50ms writes `innerHTML` directly to DOM (bypasses React re-render for smooth typewriter effect).
  - `RepoInput` — GitHub autocomplete with 300ms debounce, filters results client-side.
  - `ReportView` — renders markdown via `react-markdown` + `remark-gfm`.

- **`frontend/src/index.css`** — CSS custom properties design system (~400 lines). Key vars: `--bg`, `--accent`, `--text-*`, `--border-*`.

### Key SSE Event Types

| Type | Direction | Payload |
|------|-----------|---------|
| `repo_progress` | per-repo | `{ repo, msg }` |
| `repo_text` | per-repo | `{ repo, chunk }` |
| `repo_reasoning` | per-repo | `{ repo, chunk }` |
| `repo_done` | per-repo | `{ repo }` |
| `progress` | global | `{ msg }` |
| `text` | global | `{ chunk }` (summary report) |
| `done` | global | — |
| `error` | global | `{ msg }` |
| `usage` | per-repo | `{ repo, promptTokens, completionTokens, totalTokens }` |

## Important Notes

- **MiniMax tool-calling bug**: MiniMax `reasoning_split` mode generates empty `{}` for tool params in streaming. All GitHub API calls are made directly (no model tool calling).
- **GitHub token**: Set via `GITHUB_TOKEN` in `.dev.vars` (local) or `wrangler secret put GITHUB_TOKEN` (Cloudflare).
- **Environment vars**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `AI_MODEL_NAME`, `GITHUB_TOKEN` via Cloudflare dashboard or `.dev.vars`.
- **Frontend API base**: `VITE_API_BASE_URL` in `frontend/.env`.
