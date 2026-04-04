// Repo Agent - analyzes GitHub repositories using MiniMax AI v4
import { streamText } from 'ai'
import { createMinimaxOpenAI } from 'vercel-minimax-ai-provider'
import { githubTools } from '../tools/github'

function parseRepo(input: string): { owner: string; name: string } {
  const trimmed = input.trim()
  const match = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (match) return { owner: match[1], name: match[2] }
  const parts = trimmed.split('/')
  if (parts.length === 2 && parts[0] && parts[1]) return { owner: parts[0], name: parts[1] }
  throw new Error(`Invalid repo format: "${input}". Expected "owner/repo" or GitHub URL.`)
}

export type RepoEvent =
  | { type: 'progress'; msg: string }
  | { type: 'text'; chunk: string }
  | { type: 'reasoning'; chunk: string }

export async function* streamRepoAgent(
  repo: string,
  apiKey: string,
  baseURL: string,
  modelName: string
): AsyncGenerator<RepoEvent> {
  const minimax = createMinimaxOpenAI({ apiKey, baseURL })
  const model = minimax(modelName)

  const { owner, name } = parseRepo(repo)

  const result = streamText({
    model,
    tools: githubTools,
    maxSteps: 8,
    system: `你是一个 GitHub 仓库分析助手。请使用提供的工具全面分析指定的 GitHub 仓库，然后生成约300字的中文结构化摘要，涵盖以下5个维度：
1. 活跃度：最近的 commit 频率和趋势
2. 社区规模：stars、forks、贡献者数量
3. 代码质量信号：README 完整度、发版规律
4. 生态依赖：语言、许可证
5. 维护状态：最后更新时间、问题处理情况

请先调用工具收集数据，然后输出分析摘要。`,
    prompt: `请分析 GitHub 仓库：${owner}/${name}`,
  })

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'tool-call') {
      yield { type: 'progress', msg: `🔧 调用工具: ${chunk.toolName}` }
    } else if (chunk.type === 'tool-result') {
      yield { type: 'progress', msg: `✅ 工具完成: ${chunk.toolName}` }
    } else if (chunk.type === 'text-delta' && chunk.textDelta) {
      yield { type: 'text', chunk: chunk.textDelta }
    } else if (chunk.type === 'reasoning') {
      yield { type: 'reasoning', chunk: chunk.textDelta }
    }
  }
}
