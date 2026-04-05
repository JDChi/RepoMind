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

# Run backend tests
npm test
```

## Architecture

### Backend — Cloudflare Workers (Hono + Vercel AI SDK)

- **`src/routes/compare.ts`** — Single SSE endpoint `POST /api/compare`. Two-phase flow:
  1. **Phase 1**: Parallel repo analysis via `streamRepoAgent` (Promise.all). Each repo streams `progress/text/reasoning` events.
  2. **Phase 2**: After all repos complete, `streamSummary` generates the comparison report.
  - Accumulate `analysisText` from both `text` and `reasoning` channel chunks.
  - Token usage tracked via `model.config.includeUsage = true` + `result.usage` after stream consumed.

- **`src/agents/repo-agent.ts`** — `streamRepoAgent` async generator.
  - `fetchRepoData()` — parallel GitHub API calls for metadata (stars, forks, commits, contributors, releases, README).
  - `fetchCodeFiles()` — async generator yielding sub-steps [1/4] through [4/4] for code structure analysis.
  - Uses `streamText` (no tools) to generate analysis text. MiniMax `reasoning_split` mode outputs via `reasoning`/`reasoning-delta` channels, not `text-delta`.
  - Yields: `{type: 'progress'|'text'|'reasoning'|'usage'}`
  - `includeUsage` enabled via `model.config.includeUsage = true`.

- **`src/agents/summarizer-agent.ts`** — `streamSummary` async generator. Takes all repo analyses and streams a comparison report via `streamText`. Uses `usageOut` parameter to return usage stats.

- **`src/utils/repo.ts`** — Shared repo parsing and validation utilities.
  - `parseRepo(input)` — parses both `owner/repo` and GitHub URL formats.
  - `validateAndParseRepo(input)` — parses then validates against `GITHUB_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`.
  - `validateAndParseRepo` is used by both `compare.ts` and `repo-agent.ts` to avoid duplication.

- **`src/tools/github.ts`** — GitHub API utilities.
  - `fetchFileTree()` — `GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1`
  - `fetchFileContent()` — `GET /repos/{owner}/{repo}/contents/{path}`
  - `fetchCodeFiles()` — async generator, priority-scored file selection + batch fetch with rate limiting
  - `analyzeCodeFiles()` — parses files to extract: language, packageManager, dependencyCount, hasTests, hasLinter, hasCI, hasDocker, hasAPI, topLevelDirs

### Frontend — React + Vite

- **`frontend/src/App.tsx`** — Main component with SSE consumption via `fetch` + `ReadableStream`.
  - **Typewriter effect**: text/reasoning panels use character-pointer streaming — `setInterval` at 30ms advances display pointer by 3 chars/tick normally, 15 chars/tick when lag > 150 chars.
  - All `innerHTML` writes are escaped via `escapeHtml()` before insertion.
  - Interval cleanup on component unmount via `useEffect` return.
  - Stable repo keys via `repoKeysRef` to avoid React key reuse issues.
  - `RepoInput` — GitHub autocomplete with debounced `AbortController`-based fetch cancellation.
  - `ReportView` — renders markdown via `react-markdown` + `remark-gfm`.
  - `ExportButton` — exports HTML with `DOMPurify.sanitize()` XSS protection.

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
- **CORS**: `ALLOWED_ORIGIN` env var supports comma-separated list of origins. Set via `wrangler secret put ALLOWED_ORIGIN` (Cloudflare) or `.dev.vars` (local, defaults to `http://localhost:5173`).
- **Token usage**: Enable via `model.config.includeUsage = true` on the provider model; collected via `result.usage` after stream consumed.
