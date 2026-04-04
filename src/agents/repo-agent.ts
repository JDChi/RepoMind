import { githubTools } from '../tools/github'

function parseRepo(input: string): { owner: string; name: string } {
  const trimmed = input.trim()
  const match = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (match) return { owner: match[1], name: match[2] }
  const parts = trimmed.split('/')
  if (parts.length === 2 && parts[0] && parts[1]) return { owner: parts[0], name: parts[1] }
  throw new Error(`Invalid repo format: "${input}". Expected "owner/repo" or GitHub URL.`)
}

async function callAI(apiKey: string, baseURL: string, modelName: string, system: string, user: string): Promise<string> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      stream: false
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AI API error: ${res.status} ${text}`)
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content || ''
}

export async function createRepoAgent(repo: string, apiKey: string, baseURL: string, modelName: string): Promise<string> {
  const { owner, name } = parseRepo(repo)

  const systemPrompt = `你是一个 GitHub 仓库分析助手。请使用提供的工具全面分析指定的 GitHub 仓库，然后生成约300字的中文结构化摘要，涵盖以下5个维度：
1. 活跃度：最近的 commit 频率和趋势
2. 社区规模：stars、forks、贡献者数量
3. 代码质量信号：README 完整度、发版规律
4. 生态依赖：语言、许可证
5. 维护状态：最后更新时间、问题处理情况

请先调用工具收集数据，然后输出分析摘要。`

  // Tool calling simulation - for now just use GitHub tools directly
  const toolResults: Record<string, unknown> = {}

  // Call each tool
  for (const tool of Object.values(githubTools)) {
    try {
      const result = await tool.execute({ owner, repo: name })
      toolResults[tool.description.split(' ')[0]] = result
    } catch (e) {
      // skip failed tools
    }
  }

  const dataSummary = JSON.stringify(toolResults)

  const userPrompt = `请分析 GitHub 仓库：${owner}/${name}

收集到的数据：
${dataSummary}

请根据以上数据生成分析摘要。`

  return callAI(apiKey, baseURL, modelName, systemPrompt, userPrompt)
}
