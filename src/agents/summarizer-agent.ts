export interface RepoAnalysis {
  repo: string
  analysis: string
}

async function callAIStream(apiKey: string, baseURL: string, modelName: string, system: string, user: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
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
      stream: true
    })
  })

  if (!res.ok) {
    throw new Error(`AI API error: ${res.status}`)
  }

  return res.body!.getReader()
}

export async function* streamSummary(
  analyses: RepoAnalysis[],
  apiKey: string,
  baseURL: string,
  modelName: string
): AsyncGenerator<string> {
  const repoNames = analyses.map(a => a.repo).join(' vs ')
  const analysesText = analyses
    .map(a => `## ${a.repo}\n${a.analysis}`)
    .join('\n\n')

  const systemPrompt = `你是一个技术选型顾问。根据提供的各仓库分析数据，生成结构化的对比报告。
报告必须严格按照以下格式输出：

# RepoMind 对比报告：${repoNames}
## 总体推荐
（简明推荐结论，1-2句话）
## 各维度对比
| 维度 | ${analyses.map(a => a.repo).join(' | ')} |
|------|${analyses.map(() => '---').join('|')}|
| 活跃度 | | |
| 社区规模 | | |
| 代码质量 | | |
| 生态依赖 | | |
| 维护状态 | | |
## 各仓库详细分析
（每个仓库的详细分析段落）
## 选型建议
（具体的使用场景建议）`

  const userPrompt = `请根据以下各仓库的分析数据，生成对比报告：

${analysesText}

报告标题：RepoMind 对比报告：${repoNames}`

  const reader = await callAIStream(apiKey, baseURL, modelName, systemPrompt, userPrompt)
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    // Parse SSE-like format from MiniMax
    const lines = chunk.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.choices?.[0]?.delta?.content) {
            yield parsed.choices[0].delta.content
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}
