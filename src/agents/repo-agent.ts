import { generateText } from 'ai'
import { createMinimaxOpenAI } from 'vercel-minimax-ai-provider'
import { githubTools } from '../tools/github'

function parseRepo(input: string): { owner: string; name: string } {
  // Support both "owner/repo" and full GitHub URLs
  const trimmed = input.trim()
  // Match GitHub URLs like https://github.com/owner/repo or github.com/owner/repo
  const match = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (match) return { owner: match[1], name: match[2] }
  const parts = trimmed.split('/')
  if (parts.length === 2 && parts[0] && parts[1]) return { owner: parts[0], name: parts[1] }
  throw new Error(`Invalid repo format: "${input}". Expected "owner/repo" or GitHub URL.`)
}

export async function createRepoAgent(repo: string, apiKey: string, baseURL: string, modelName: string): Promise<string> {
  const minimax = createMinimaxOpenAI({ apiKey, baseURL })
  const model = minimax(modelName)

  const { owner, name } = parseRepo(repo)

  const result = await generateText({
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

  return result.text
}
