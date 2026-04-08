# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the Cloudflare Worker backend. Entry point is `src/index.ts`, HTTP routes live in `src/routes/`, AI workflows in `src/agents/`, GitHub integration in `src/tools/`, and shared helpers plus unit tests in `src/utils/`. The React client lives in `frontend/src/` with UI components under `frontend/src/components/`. Static assets are in `frontend/public/`, and longer-form notes live in `docs/`.

## Build, Test, and Development Commands
Install dependencies at the repo root with `npm install`, then install frontend-only dependencies with `cd frontend && npm install` when needed.

- `npm run dev:worker` starts the Hono app in Wrangler on port `8787`.
- `npm run dev:frontend` starts the Vite UI on port `5173`.
- `npm run build` builds the frontend bundle.
- `npm test` runs Vitest for backend/unit tests in `src/**/*.test.ts`.
- `npx wrangler deploy` deploys the Worker after local validation.

## Coding Style & Naming Conventions
This repo uses strict TypeScript (`tsconfig.json`) with ES module syntax and React function components. Follow the existing style: 2-space indentation, single quotes, semicolon-free statements, and concise helper functions. Use `camelCase` for variables/functions, `PascalCase` for React components and interfaces, and kebab-case for route files such as `src/routes/compare.ts`. Keep modules focused; shared parsing and validation logic belongs in `src/utils/`.

## Testing Guidelines
Vitest is configured in [`vitest.config.ts`](/Users/chijiaduo/develop/RepoMind/vitest.config.ts). Add tests beside the code they cover using the `*.test.ts` suffix, for example [`src/utils/repo.test.ts`](/Users/chijiaduo/develop/RepoMind/src/utils/repo.test.ts). Cover happy paths and invalid input cases, especially for repo parsing, GitHub API normalization, and streaming helpers. Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes such as `feat:`, `fix:`, and `docs:`. Keep subjects short and imperative, for example `fix: validate duplicate repo inputs`. PRs should explain the user-visible change, note any config or env var updates, link related issues, and include screenshots or GIFs for frontend changes.

## Security & Configuration Tips
Keep secrets in `.dev.vars` for the Worker and `frontend/.env` for the client. Typical local variables include `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `AI_MODEL_NAME`, `GITHUB_TOKEN`, `ALLOWED_ORIGIN`, and `VITE_API_BASE_URL`. Never commit tokens or generated secret files.
