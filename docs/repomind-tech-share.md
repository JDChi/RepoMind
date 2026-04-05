# RepoMind 技术分享

## 一、项目概述

### 是什么

RepoMind 是一个 GitHub 仓库智能对比工具，用户输入多个仓库地址后，AI 并行分析各仓库的活跃度、社区规模、代码质量、生态依赖和维护状态，生成结构化对比报告。

### 核心流程

```
用户输入 (owner/repo) → SSE 流式分析 → 实时展示 → 对比报告
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + Vite + TypeScript |
| 后端 | Hono + Cloudflare Workers |
| AI 集成 | Vercel AI SDK v6 + MiniMax |
| 数据源 | GitHub REST API |

---

## 二、架构总览

### 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                                                                  │
│  用户输入 repos ──► POST /api/compare ──► SSE Response          │
│                           ▲              │                       │
│                           │              ▼                       │
│                    ┌──────┴────────┐                            │
│                    │  fetch +     │                            │
│                    │  ReadableStream│                           │
│                    └──────┬────────┘                            │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │ RepoPanel│◄───│ Typewriter Effect │◄──│  Accumulated   │     │
│  │ (per repo)│    │ (30ms interval)  │    │  Text Buffer   │     │
│  └─────────┘    └─────────────────┘    └─────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Hono + CF Workers)                   │
│                                                                  │
│  POST /api/compare                                              │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐    Phase 1 (并行)    ┌──────────────────┐    │
│  │   validate   │ ───────────────────► │  streamRepoAgent │    │
│  │    repos     │                      │   (per repo)     │    │
│  └─────────────┘                       └────────┬─────────┘    │
│                                                  │               │
│                     ┌────────────────────────────┼───────────┐  │
│                     │                            ▼           │  │
│                     │  ┌──────────────────────────────┐     │  │
│                     │  │ fetchRepoData: stars, forks,  │     │  │
│                     │  │ commits, contributors,       │     │  │
│                     │  │ releases, README             │     │  │
│                     │  └──────────────────────────────┘     │  │
│                     │                                      │  │
│                     │  ┌──────────────────────────────┐     │  │
│                     │  │ fetchCodeFiles: file tree,   │     │  │
│                     │  │ priority scoring, batch fetch│     │  │
│                     │  └──────────────────────────────┘     │  │
│                     │                                      │  │
│                     │  ┌──────────────────────────────┐     │  │
│                     │  │ streamText: generate         │     │  │
│                     │  │ analysis with AI             │     │  │
│                     │  └──────────────────────────────┘     │  │
│                     └──────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────┐    Phase 2 (串行)    ┌──────────────────┐     │
│  │ SSE writer  │◄─────────────────── │   streamSummary  │     │
│  │             │                      │  (comparison)    │     │
│  └──────┬──────┘                      └──────────────────┘     │
│         │                                                        │
└─────────┼────────────────────────────────────────────────────────┘
          │ SSE Events
          ▼
  repo_progress, repo_text, repo_reasoning, repo_done
  progress, text (summary), done
```

### 两阶段设计

| 阶段 | 处理 | 并行性 |
|------|------|--------|
| Phase 1 | 各仓库独立分析 | 本地并行，生产环境串行 |
| Phase 2 | 生成对比报告 | 串行 |

> **注意**：Cloudflare Workers 有 subrequest 限制（默认 50），所以生产环境中 Phase 1 实际上是串行执行的。本地开发环境（`NODE_ENV=local`）没有这个限制，可以并行处理。

---

## 三、前端：流式交互设计

### 3.1 SSE 消费

前端使用原生 `fetch` + `ReadableStream` 消费 SSE：

```typescript
const res = await fetch(`${API_BASE_URL}/api/compare`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ repos }),
})

const reader = res.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  // SSE 事件以 \n\n 分隔
  const events = buffer.split('\n\n')
  buffer = events.pop() ?? ''

  for (const event of events) {
    const line = event.split('\n').find(l => l.startsWith('data: '))
    if (!line) continue
    const parsed = JSON.parse(line.slice(6))
    // 处理不同类型的 SSE 事件
  }
}
```

**关键点**：
- 使用 `ReadableStream` 的 `getReader()` 进行流式读取
- `decoder.decode(value, { stream: true })` 保持连接的字符编码状态
- SSE 事件以 `\n\n` 分隔，需要 buffer 暂存不完整的事件

### 3.2 Typewriter 效果

文字不是瞬间显示的，而是模拟打字机效果逐字符呈现：

```typescript
const startTextWriter = (repo: string) => {
  if (textIntervalRefs.current[repo]) return

  textIntervalRefs.current[repo] = setInterval(() => {
    const acc = textAccRefs.current[repo] || ''
    const displayed = textDisplayedRefs.current[repo] ?? 0
    if (displayed >= acc.length) return

    const lag = acc.length - displayed
    // 正常速度：3 字符/30ms ≈ 100 字符/秒
    // 延迟时加速：15 字符/30ms 追赶
    const step = lag > 150 ? 15 : 3
    const next = Math.min(displayed + step, acc.length)

    textDisplayedRefs.current[repo] = next

    // 直接操作 DOM（避免 React 状态更新开销）
    const el = textElRefs.current[repo]
    if (el) {
      el.innerHTML = escapeHtml(acc.slice(0, next)).replace(/\n/g, '<br>') + '<span class="streaming-cursor"></span>'
    }
  }, 30)
}
```

**动态加速机制**：
- 正常情况：30ms 间隔，每次显示 3 个字符
- 延迟检测：当缓冲区落后超过 150 字符时，改为每次 15 字符，加速追赶

**为什么不用 React 状态更新**：
- SSE 事件可能非常频繁（每秒几十个 chunk）
- 直接操作 DOM 避免 React 渲染开销
- 使用 `ref` 跟踪已显示字符数，指针模型而非累积

### 3.3 安全防护

所有用户可见的文本都必须经过 HTML 转义：

```typescript
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
```

在导出 HTML 时，还使用 `DOMPurify.sanitize()` 进行 XSS 防护。

### 3.4 React ref 使用模式

为了避免流式更新导致的 React 状态爆炸，采用 ref 模式：

```typescript
// 累积文本（不被 React 追踪）
const textAccRefs = useRef<Record<string, string>>({})
// 已显示的字符指针
const textDisplayedRefs = useRef<Record<string, number>>({})
// setInterval ID（用于清理）
const textIntervalRefs = useRef<Record<string, ReturnType<typeof setInterval> | null>>({})

// DOM 元素的 ref（直接操作）
const textElRefs = useRef<Record<string, HTMLElement | null>>({})
```

**生命周期管理**：
- `useEffect` return 清理所有 interval
- `repo_done` 事件时清除对应 repo 的 interval
- 使用 `useRef` 保持跨渲染周期的可变状态

---

## 四、后端：Agent 架构

### 4.1 streamRepoAgent：仓库分析 Agent

核心是一个 `AsyncGenerator`，逐步 yield 不同类型的事件：

```typescript
export async function* streamRepoAgent(
  repo: string,
  apiKey: string,
  baseURL: string,
  modelName: string,
  githubToken?: string,
  signal?: AbortSignal
): AsyncGenerator<RepoEvent>
```

**事件类型**：

| 类型 | 用途 |
|------|------|
| `progress` | 进度消息（如 "正在获取数据..."） |
| `text` | AI 生成的分析文本 |
| `reasoning` | AI 的推理过程（reasoning_split 模式） |

**处理流程**：

```
1. fetchRepoData() — 并行获取 GitHub 元数据
   - stars, forks, issues
   - commit activity (近 52 周)
   - contributors
   - releases
   - README

2. fetchCodeFiles() — 获取代码结构分析
   - 文件树扫描
   - 优先级评分
   - 关键文件内容抓取

3. streamText() — 调用 AI 生成分析
   - system prompt 定义分析维度
   - 5 个维度：活跃度、社区规模、代码质量、生态依赖、维护状态
```

### 4.2 fetchCodeFiles：优先级文件抓取

GitHub API 有限制（文件大小、速率限制），所以需要智能选择：

```typescript
function getFilePriority(path: string): number {
  // P0: 包管理文件（直接决定依赖数量）
  if (path.endsWith('package.json')) return 100
  if (path.endsWith('go.mod')) return 100
  if (path.endsWith('Cargo.toml')) return 100

  // P1: 代码规范配置
  if (path.includes('.eslintrc')) return 80
  if (path.includes('ruff.toml')) return 80

  // P2: 测试文件
  if (path.includes('/test/')) return 70

  // P3: 源代码
  if (path.includes('/src/')) return 60

  // P4: CI/CD、Docker
  if (path.includes('.github/workflows')) return 50

  // P5: 文档
  if (path.toLowerCase().includes('readme')) return 30

  return 5
}
```

**分批抓取策略**：

```typescript
const concurrency = token ? 10 : 4  // 有 token 可提高并发
const delayMs = token ? 20 : 100    // 有 token 可减小间隔

for (let i = 0; i < candidates.length; i += concurrency) {
  const batch = candidates.slice(i, i + concurrency)
  const settled = await Promise.allSettled(
    batch.map(c => fetchFileContent(...))
  )
  // 处理结果...

  if (i + concurrency < candidates.length) {
    await new Promise(r => setTimeout(r, delayMs))
  }
}
```

### 4.3 streamSummary：两阶段设计

Phase 1 的输出（各仓库分析）作为 Phase 2 的输入：

```typescript
// Phase 1: 收集各仓库分析结果
const analyses: Array<{ repo: string; analysis: string }> = []
for (const repo of repos) {
  for await (const event of streamRepoAgent(...)) {
    if (event.type === 'text') {
      analysisText += event.chunk
    }
    // SSE 传输...
  }
  analyses.push({ repo, analysis: analysisText })
}

// Phase 2: 生成对比报告
for await (const chunk of streamSummary(analyses, ...)) {
  // SSE 传输...
}
```

**summarizer-agent 的 system prompt**：

```
你是一个专业的技术架构分析顾问。根据提供的仓库数据，生成一份专业、深入的对比报告。

报告格式要求：
- 总体推荐（2-3句话，给出明确选型建议）
- 各维度深度对比：核心指标、活跃度、社区与生态、架构与代码质量等
- 各仓库核心亮点
- 详细对比分析
- 选型建议（根据不同场景）
```

### 4.4 SSE 事件传输

后端使用 `TransformStream` 桥接异步处理和 SSE 响应：

```typescript
const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
const writer = writable.getWriter()

;(async () => {
  try {
    // 处理逻辑...
    await writer.write(new TextEncoder().encode(
      `data: ${JSON.stringify({ type: 'repo_progress', repo, msg })}\n\n`
    ))
  } finally {
    writer.close()
  }
})()

return new Response(readable, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
})
```

**SSE 事件类型**：

| 事件 | 方向 | 载荷 |
|------|------|------|
| `repo_progress` | per-repo | `{ repo, msg }` |
| `repo_text` | per-repo | `{ repo, chunk }` |
| `repo_reasoning` | per-repo | `{ repo, chunk }` |
| `repo_done` | per-repo | `{ repo }` |
| `progress` | global | `{ msg }` |
| `text` | global | `{ chunk }` (summary) |
| `done` | global | — |
| `error` | global | `{ msg }` |

---

## 五、关键设计决策

### 5.1 为什么用 AsyncGenerator？

`streamRepoAgent` 使用 `AsyncGenerator` 而不是普通函数，有几个好处：

1. **流式 yield**：可以在处理过程中逐步返回结果
2. **内存友好**：不需要一次性加载所有结果
3. **背压处理**：消费者可以控制处理速度

### 5.2 为什么前端直接操作 DOM？

原因：
- SSE chunk 频率高（可能 30ms 一次）
- React 状态更新有渲染开销
- Typewriter 动画需要 60fps 更新

但这样做是**有代价的**：
- 失去了 React 的声明式优势
- 需要手动管理 ref 和清理
- 状态最终还是要同步回 React（done 时）

### 5.3 MiniMax reasoning_split 模式

MiniMax 的 `reasoning_split` 模式会将推理过程输出到 `reasoning`/`reasoning-delta` 通道，而不是 `text-delta`。这带来一些处理复杂性：

```typescript
for await (const chunk of result.fullStream) {
  if (chunk.type === 'text-delta') {
    yield { type: 'text', chunk: chunk.textDelta }
  } else if (chunk.type === 'reasoning') {
    yield { type: 'reasoning', chunk: chunk.textDelta }
  } else if (chunk.type === 'reasoning-delta') {
    yield { type: 'reasoning', chunk: chunk.text }
  }
}
```

---

## 六、工程挑战与解决方案

### 6.1 Cloudflare Workers Subrequest 限制

Workers 默认最多 50 个 subrequest，而 GitHub API 调用很多：

**解决**：
1. 本地环境并行（无限制）
2. 生产环境串行执行
3. 限制每个仓库只抓取 10 个文件

### 6.2 GitHub API 速率限制

无 token 时 60 请求/小时，有 token 时 5000 请求/小时。

**解决**：
1. 使用 `GITHUB_TOKEN` 提高限制
2. 抓取文件时加入延迟（20-100ms）
3. 优先抓取高优先级文件

### 6.3 CORS 配置

Workers 需要配置允许的源：

```typescript
// .dev.vars
ALLOWED_ORIGIN=http://localhost:5173
```

---

## 七、总结

RepoMind 的核心设计：

1. **两阶段架构**：并行仓库分析 → 串行报告生成
2. **流式 SSE**：前后端都使用流式处理，实时反馈
3. **Typewriter 效果**：动态加速的字符级动画
4. **AsyncGenerator**：优雅的流式数据处理模式
5. **优先级抓取**：智能选择最重要的文件

这个架构展示了如何构建一个现代的 AI 应用，结合了：
- 实时交互（Web 原生 SSE）
- 流式 AI 输出（Vercel AI SDK）
- 云原生后端（Cloudflare Workers）
