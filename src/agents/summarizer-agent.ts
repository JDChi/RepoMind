import { streamText } from 'ai'
import { createMinimaxOpenAI } from 'vercel-minimax-ai-provider'

export interface RepoAnalysis {
  repo: string
  analysis: string
}

export async function* streamSummary(
  analyses: RepoAnalysis[],
  apiKey: string,
  baseURL: string,
  modelName: string
): AsyncGenerator<string> {
  const minimax = createMinimaxOpenAI({ apiKey, baseURL })
  const model = minimax(modelName)

  const repoNames = analyses.map(a => a.repo).join(' vs ')
  const analysesText = analyses
    .map(a => `## ${a.repo}\n${a.analysis}`)
    .join('\n\n')

  const result = await streamText({
    model,
    system: `你是一个技术选型顾问。根据提供的各仓库分析数据，生成结构化的对比报告。
报告必须严格按照以下格式输出：

# RepoMind 对比报告：{仓库名列表}
## 总体推荐
（简明推荐结论，1-2句话）
## 各维度对比
| 维度 | ${analyses.map(a => a.repo).join(' | ')} |
|------|${analyses.map(() => '---').join('|')}|
| 活跃度 | | |
| 社区规模 | | |
| 代码质量 | | |
| 架构设计 | | |
| 生态依赖 | | |
| 维护状态 | | |
## 各仓库详细分析
（每个仓库的详细分析段落）
## 选型建议
（具体的使用场景建议）`,
    prompt: `请根据以下各仓库的分析数据，生成对比报告：

${analysesText}

报告标题：RepoMind 对比报告：${repoNames}`,
  })

  for await (const chunk of result.textStream) {
    yield chunk
  }
}
