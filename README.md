# RepoMind

GitHub 仓库智能对比工具。输入多个 GitHub 仓库，AI 并行分析各仓库的活跃度、社区规模、代码质量、生态依赖和维护状态，生成结构化对比报告，支持导出 MD/HTML。

## Tech Stack

- **Frontend**: React + Vite (Cloudflare Pages)
- **Backend**: Hono (Cloudflare Workers)
- **AI**: Vercel AI SDK v6 + MiniMax
- **Data**: GitHub REST API

## Development

```bash
# Install dependencies
npm install

# Start backend (Worker)
wrangler dev

# Start frontend
vite
```

## Deploy

```bash
wrangler deploy
```
