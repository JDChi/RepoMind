// Repo Agent - analyzes GitHub repositories using MiniMax AI v4
import { streamText } from 'ai'
import { createMinimaxOpenAI } from 'vercel-minimax-ai-provider'
import { createGithubTools } from '../tools/github'

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

async function fetchRepoData(owner: string, repo: string, token?: string): Promise<string> {
  // Import the tools and manually call them
  const tools = createGithubTools(token)
  const headers: Record<string, string> = {
    'User-Agent': 'RepoMind',
    'Accept': 'application/vnd.github.v3+json',
  }
  if (token) headers['Authorization'] = `token ${token}`

  const [repoRes, commitRes, contribRes, releaseRes, readmeRes] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/stats/commit_activity`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers }),
  ])

  let summary = `## ${owner}/${repo} 数据概览\n\n`

  if (repoRes.status === 'fulfilled') {
    const data = await repoRes.value.json() as Record<string, unknown>
    summary += `**基础信息**: ⭐ ${data.stargazers_count} stars | 🍴 ${data.forks_count} forks | 📝 ${data.open_issues_count} issues\n`
    summary += `**语言**: ${data.language || '未知'} | **许可证**: ${(data.license as Record<string, unknown>)?.spdx_id || '未知'}\n`
    summary += `**创建时间**: ${new Date(data.created_at as string).toLocaleDateString('zh-CN')} | **最后更新**: ${new Date(data.updated_at as string).toLocaleDateString('zh-CN')}\n`
    summary += `**描述**: ${data.description || '无'}\n`
  }

  if (commitRes.status === 'fulfilled') {
    const data = await commitRes.value.json() as Array<{ total: number }>
    if (Array.isArray(data) && data.length > 0) {
      const total = data.reduce((s, w) => s + w.total, 0)
      const recent = data.slice(-4).reduce((s, w) => s + w.total, 0)
      summary += `\n**提交活动**: 近52周共 ${total} commits，近4周 ${recent} commits\n`
    }
  }

  if (contribRes.status === 'fulfilled') {
    const data = await contribRes.value.json() as Array<{ login: string; contributions: number }>
    if (Array.isArray(data)) {
      summary += `**贡献者**: ${data.length} 人\n`
    }
  }

  if (releaseRes.status === 'fulfilled') {
    const data = await releaseRes.value.json() as Array<{ tag_name: string; published_at: string }>
    if (Array.isArray(data) && data.length > 0) {
      summary += `**最新版本**: ${data[0].tag_name} (${new Date(data[0].published_at).toLocaleDateString('zh-CN')})\n`
    }
  }

  if (readmeRes.status === 'fulfilled') {
    try {
      const data = await readmeRes.value.json() as { content: string }
      const content = atob(data.content.replace(/\n/g, ''))
      summary += `\n**README 摘要**: ${content.slice(0, 300)}...\n`
    } catch { /* ignore */ }
  }

  return summary
}

export async function* streamRepoAgent(
  repo: string,
  apiKey: string,
  baseURL: string,
  modelName: string,
  githubToken?: string
): AsyncGenerator<RepoEvent> {
  const minimax = createMinimaxOpenAI({ apiKey, baseURL })
  const model = minimax(modelName)

  const { owner, name } = parseRepo(repo)
  const prompt = `请分析 GitHub 仓库：${owner}/${name}`

  yield { type: 'progress', msg: `📡 正在获取 ${owner}/${name} 的 GitHub 数据...` }

  // Fetch data directly (bypass model tool-calling which is broken on MiniMax)
  let repoData: string
  try {
    repoData = await fetchRepoData(owner, name, githubToken)
  } catch (e: any) {
    repoData = `获取数据失败: ${e.message}`
  }

  yield { type: 'progress', msg: `✅ 数据获取完成，正在生成分析...` }

  // Now use streamText to generate analysis with the collected data
  const result = streamText({
    model,
    maxSteps: 2,
    system: `你是一个 GitHub 仓库分析助手。根据提供的仓库数据，生成约300字的中文结构化摘要，涵盖以下5个维度：
1. 活跃度：最近的 commit 频率和趋势
2. 社区规模：stars、forks、贡献者数量
3. 代码质量信号：README 完整度、发版规律
4. 生态依赖：语言、许可证
5. 维护状态：最后更新时间、问题处理情况

直接输出分析摘要，不需要再调用任何工具。`,
    prompt: `请根据以下数据，分析 GitHub 仓库 ${owner}/${name}：

${repoData}`,
  })

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta' && chunk.textDelta) {
      yield { type: 'text', chunk: chunk.textDelta }
    } else if (chunk.type === 'reasoning') {
      yield { type: 'reasoning', chunk: chunk.textDelta }
    } else if (chunk.type === 'reasoning-delta') {
      // @ts-ignore
      yield { type: 'reasoning', chunk: chunk.text }
    }
  }
}
