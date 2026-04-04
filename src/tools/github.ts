import { tool } from 'ai'
import { z } from 'zod'

const GITHUB_API = 'https://api.github.com'

function getHeaders(token?: string) {
  const headers: Record<string, string> = {
    'User-Agent': 'RepoMind',
    'Accept': 'application/vnd.github.v3+json',
  }
  if (token) headers['Authorization'] = `token ${token}`
  return headers
}

async function githubFetch(url: string, token?: string): Promise<unknown> {
  const hdrs = getHeaders(token)
  const res = await fetch(url, { headers: hdrs })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json()
}

// Extract owner/repo from the prompt since MiniMax model doesn't generate tool params correctly
function extractRepoFromPrompt(prompt: string): { owner: string; repo: string } {
  // prompt format: "请分析 GitHub 仓库：owner/repo"
  const match = prompt.match(/仓库[：:]\s*([^\s]+)/)
  if (!match) throw new Error('Cannot extract repo from prompt')
  const [owner, repo] = match[1].split('/')
  if (!owner || !repo) throw new Error('Invalid repo format in prompt')
  return { owner, repo }
}

const GITHUB_SLUG_REGEX = /^[a-zA-Z0-9._-]+$/

export function createGithubTools(token?: string, prompt?: string) {
  let context = { prompt: prompt || '' }

  return {
    getRepoInfo: tool({
      description: 'Get repository basic info: stars, forks, open issues, language, license, description',
      parameters: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      execute: async ({ owner, repo }) => {
        // Fallback: extract from prompt if not provided
        if (!owner || !repo) {
          const extracted = extractRepoFromPrompt(context.prompt)
          owner = extracted.owner
          repo = extracted.repo
        }
        const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`, token) as Record<string, unknown>
        return {
          stars: data.stargazers_count,
          forks: data.forks_count,
          openIssues: data.open_issues_count,
          language: data.language,
          license: (data.license as Record<string, unknown>)?.spdx_id ?? null,
          description: data.description,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }
      },
    }),

    getCommitActivity: tool({
      description: 'Get commit activity for the last 52 weeks',
      parameters: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      execute: async ({ owner, repo }) => {
        if (!owner || !repo) {
          const extracted = extractRepoFromPrompt(context.prompt)
          owner = extracted.owner
          repo = extracted.repo
        }
        const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/stats/commit_activity`, token) as Array<{ total: number }>
        if (!Array.isArray(data)) return { weeklyCommits: [], totalLast52Weeks: 0 }
        const totalLast52Weeks = data.reduce((sum, w) => sum + w.total, 0)
        const recentWeeks = data.slice(-4).map(w => w.total)
        return { totalLast52Weeks, recentWeeks }
      },
    }),

    getContributors: tool({
      description: 'Get contributor count and top contributors',
      parameters: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      execute: async ({ owner, repo }) => {
        if (!owner || !repo) {
          const extracted = extractRepoFromPrompt(context.prompt)
          owner = extracted.owner
          repo = extracted.repo
        }
        const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=100`, token) as Array<{ login: string; contributions: number }>
        if (!Array.isArray(data)) return { totalContributors: 0, top5: [] }
        return {
          totalContributors: data.length,
          hasMore: data.length === 100,
          top5: data.slice(0, 5).map(c => ({ login: c.login, contributions: c.contributions })),
        }
      },
    }),

    getReleases: tool({
      description: 'Get release history and latest version',
      parameters: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      execute: async ({ owner, repo }) => {
        if (!owner || !repo) {
          const extracted = extractRepoFromPrompt(context.prompt)
          owner = extracted.owner
          repo = extracted.repo
        }
        const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/releases?per_page=10`, token) as Array<{ tag_name: string; published_at: string }>
        if (!Array.isArray(data)) return { totalReleases: 0, latestVersion: null, latestDate: null }
        return {
          totalReleases: data.length,
          latestVersion: data[0]?.tag_name ?? null,
          latestDate: data[0]?.published_at ?? null,
          recentReleases: data.slice(0, 5).map(r => ({ tag: r.tag_name, date: r.published_at })),
        }
      },
    }),

    getReadme: tool({
      description: 'Get repository README content (first 2000 characters)',
      parameters: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      execute: async ({ owner, repo }) => {
        if (!owner || !repo) {
          const extracted = extractRepoFromPrompt(context.prompt)
          owner = extracted.owner
          repo = extracted.repo
        }
        try {
          const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, token) as { content: string }
          const content = atob(data.content.replace(/\n/g, ''))
          return { content: content.slice(0, 2000) }
        } catch {
          return { content: null }
        }
      },
    }),
  }
}
