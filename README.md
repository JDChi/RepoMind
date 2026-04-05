# RepoMind

> AI-powered GitHub repository comparison tool

![Demo](frontend/public/demo.gif)

并行分析多个 GitHub 仓库，生成深度对比报告。支持 Stars、贡献者、代码结构、技术栈等维度，AI 实时流式输出分析结果。

## Features

- **并行仓库分析** — 同时分析多个 GitHub 仓库，不等待
- **AI 智能分析** — 基于 MiniMax 大模型，深度理解仓库质量
- **实时流式输出** — SSE 流式传输，打字机效果即时展示
- **代码结构洞察** — 自动检测语言、包管理器、测试、CI/CD、Docker
- **对比报告生成** — 专业的多维度对比表格和选型建议
- **导出支持** — 一键复制 Markdown 或导出 HTML

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + TypeScript |
| Backend | Hono + Cloudflare Workers |
| AI | Vercel AI SDK + MiniMax |
| Data | GitHub REST API |

## Development

```bash
# Install dependencies
npm install

# Start backend (Cloudflare Workers, port 8787)
npm run dev:worker

# Start frontend (Vite, port 5173)
npm run dev:frontend
```

## Deploy

```bash
# Build frontend
npm run build

# Deploy to Cloudflare Workers
npx wrangler deploy
```

## Environment Variables

### Backend (.dev.vars)

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.minimax.chat
AI_MODEL_NAME=your_model_name
GITHUB_TOKEN=your_github_token
ALLOWED_ORIGIN=http://localhost:5173
```

### Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:8787
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                              │
│  ┌─────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  Input  │───►│  SSE Fetch   │───►│  Typewriter View  │  │
│  └─────────┘    └──────────────┘    └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │ POST /api/compare
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                         │
│                                                              │
│  Phase 1: 并行分析                        Phase 2: 对比报告  │
│  ┌──────────────────┐                    ┌───────────────┐  │
│  │ streamRepoAgent  │ ─── analyses ────►  │ streamSummary │  │
│  │  (per repo)      │                    │  (comparison) │  │
│  └──────────────────┘                    └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## License

MIT
