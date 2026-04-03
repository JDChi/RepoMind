import { tool } from 'ai'
import { z } from 'zod'

const GITHUB_API = 'https://api.github.com'
const HEADERS = { 'User-Agent': 'RepoMind', 'Accept': 'application/vnd.github.v3+json' }

// GitHub usernames/repos only allow alphanumeric, hyphens, underscores, and dots
const GITHUB_SLUG_REGEX = /^[a-zA-Z0-9._-]+$/

async function githubFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json()
}

export const githubTools = {
  getRepoInfo: tool({
    description: 'Get repository basic info: stars, forks, open issues, language, license, description',
    parameters: z.object({
      owner: z.string().regex(GITHUB_SLUG_REGEX, 'Invalid owner format'),
      repo: z.string().regex(GITHUB_SLUG_REGEX, 'Invalid repo format'),
    }),
    execute: async ({ owner, repo }) => {
      const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`) as Record<string, unknown>
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
      owner: z.string().regex(GITHUB_SLUG_REGEX),
      repo: z.string().regex(GITHUB_SLUG_REGEX),
    }),
    execute: async ({ owner, repo }) => {
      const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/stats/commit_activity`) as Array<{ total: number }>
      if (!Array.isArray(data)) return { weeklyCommits: [], totalLast52Weeks: 0 }
      const totalLast52Weeks = data.reduce((sum, w) => sum + w.total, 0)
      const recentWeeks = data.slice(-4).map(w => w.total)
      return { totalLast52Weeks, recentWeeks }
    },
  }),

  getContributors: tool({
    description: 'Get contributor count and top contributors',
    parameters: z.object({
      owner: z.string().regex(GITHUB_SLUG_REGEX),
      repo: z.string().regex(GITHUB_SLUG_REGEX),
    }),
    execute: async ({ owner, repo }) => {
      const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=100`) as Array<{ login: string; contributions: number }>
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
      owner: z.string().regex(GITHUB_SLUG_REGEX),
      repo: z.string().regex(GITHUB_SLUG_REGEX),
    }),
    execute: async ({ owner, repo }) => {
      const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/releases?per_page=10`) as Array<{ tag_name: string; published_at: string }>
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
      owner: z.string().regex(GITHUB_SLUG_REGEX),
      repo: z.string().regex(GITHUB_SLUG_REGEX),
    }),
    execute: async ({ owner, repo }) => {
      try {
        const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`) as { content: string }
        const content = atob(data.content.replace(/\n/g, ''))
        return { content: content.slice(0, 2000) }
      } catch {
        return { content: null }
      }
    },
  }),
}
