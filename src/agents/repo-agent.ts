import { generateText } from 'ai'
import { createMinimax } from 'vercel-minimax-ai-provider'
import { githubTools } from '../tools/github'

export async function createRepoAgent(repo: string, minimaxApiKey: string): Promise<string> {
  const minimax = createMinimax({ apiKey: minimaxApiKey })
  const model = minimax('MiniMax-M2.5-highspeed')

  const [owner, name] = repo.split('/')
  if (!owner || !name) throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`)

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
