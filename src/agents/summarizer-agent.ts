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
  modelName: string,
  usageOut?: { promptTokens: number; completionTokens: number; totalTokens: number }
): AsyncGenerator<string> {
  const minimax = createMinimaxOpenAI({ apiKey, baseURL })
  const model = minimax(modelName)

  const repoNames = analyses.map(a => a.repo).join(' vs ')
  const analysesText = analyses
    .map(a => `## ${a.repo}\n${a.analysis}`)
    .join('\n\n')

  const result = await streamText({
    model,
    system: `你是一个专业的技术架构分析顾问。根据提供的仓库数据，生成一份专业、深入的对比报告。

报告格式要求：

# RepoMind 对比报告：{仓库名列表}

## 总体推荐
（2-3句话，给出明确选型建议和核心原因）

## 各维度深度对比

### 📊 核心指标对比
| 指标 | ${analyses.map(a => a.repo).join(' | ')} |
|------|${analyses.map(() => '---').join('|')}|
| Stars | | |
| Forks | | |
| 贡献者 | | |
| 最近更新 | | |

### 🔥 活跃度与维护
（分析 commit 频率、issue 处理速度、版本发布节奏）

### 👥 社区与生态
（社区规模、第三方库支持、生态成熟度）

### 🏗️ 架构与代码质量
（从代码技术分析中提取：语言、测试覆盖、CI/CD、linter、容器化）

### 📚 文档与生态完整性
（README 质量、官方文档、CHANGELOG、锁文件）

### 🚀 技术创新与前沿性
（是否使用现代技术栈、是否有独特的创新点）

### 🎯 安全与稳定性
（许可证、已知漏洞处理、版本稳定性）

### ⚙️ 功能特性对比
（基于 README 分析两个仓库的核心功能差异，列出各自擅长的功能领域）

## 各仓库核心亮点

### ${analyses[0]?.repo || '仓库1'}
（3-5个 bullet points，突出核心优势、功能特性和适用场景）

### ${analyses[1]?.repo || '仓库2'}
（3-5个 bullet points，突出核心优势、功能特性和适用场景）

## 详细对比分析
（3-4段深入分析，覆盖功能定位差异、技术选型关键考量）

## 选型建议
根据不同场景给出推荐：
- 如果看重XXX，推荐XXX
- 如果看重YYY，推荐YYY
- 总结：XXX更适合YYY场景，YYY更适合ZZZ场景`,
    prompt: `请根据以下各仓库的分析数据，生成专业的对比报告：

${analysesText}

报告标题：RepoMind 对比报告：${repoNames}`,
  })

  for await (const chunk of result.textStream) {
    yield chunk
  }

  // Collect usage after stream is consumed
  if (usageOut) {
    try {
      const usage = await result.usage
      if (usage) {
        usageOut.promptTokens = usage.promptTokens || 0
        usageOut.completionTokens = usage.completionTokens || 0
        usageOut.totalTokens = usage.totalTokens || 0
      }
    } catch { /* ignore */ }
  }
}
