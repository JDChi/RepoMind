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

// ===== Code Analysis Functions (non-tool, direct API calls) =====

export interface TreeEntry {
  path: string
  mode: string
  type: string
  size: number
  sha: string
}

export interface CodeAnalysisResult {
  language: string
  packageManager: string | null
  dependencyCount: number
  hasLockFile: boolean
  hasTests: boolean
  hasLinter: boolean
  hasCI: boolean
  hasDocker: boolean
  hasAPI: boolean
  topLevelDirs: string[]
  keyFiles: string[]
}

export async function fetchFileTree(owner: string, repo: string, token?: string, signal?: AbortSignal): Promise<TreeEntry[]> {
  const headers = getHeaders(token)
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers, signal })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = await res.json() as { tree: TreeEntry[] }
  return data.tree.filter(f => f.type === 'blob')
}

export async function fetchFileContent(owner: string, repo: string, path: string, token?: string, signal?: AbortSignal): Promise<string | null> {
  const headers = getHeaders(token)
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, { headers, signal })
  if (!res.ok) return null
  const data = await res.json() as { content: string; encoding: string }
  if (data.encoding === 'base64') {
    return atob(data.content.replace(/\n/g, ''))
  }
  return null
}

function getFilePriority(path: string): number {
  const p0Patterns = [
    'package.json', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
    'pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile',
    'tsconfig.json', 'go.sum', 'Cargo.lock', 'package-lock.json',
    'yarn.lock', 'pnpm-lock.yaml',
  ]
  for (const p of p0Patterns) {
    if (path.endsWith(p)) return 100
  }

  const p1Patterns = ['.eslintrc', '.prettierrc', 'ruff.toml', 'pylintrc', '.golangci.yml']
  for (const p of p1Patterns) {
    if (path.includes(p)) return 80
  }

  if (path.includes('/test/') || path.includes('/tests/') || path.includes('/__tests__/') ||
      path.includes('_test.') || path.includes('.test.') || path.includes('.spec.')) return 70

  if (path.includes('/src/') || path.includes('/lib/') || path === 'main.go' || path === 'main.rs') return 60
  if (path.includes('/cmd/') || path.includes('/internal/')) return 55

  if (path.includes('.github/workflows') || path.includes('.gitlab-ci')) return 50
  if (path.includes('docker-compose') || path === 'Dockerfile') return 45
  if (path.endsWith('.proto') || path.endsWith('.graphql') || path.includes('openapi')) return 40
  if (path.toLowerCase().includes('readme')) return 30
  if (path.toLowerCase().includes('changelog')) return 20

  return 5
}

export async function* fetchCodeFiles(
  owner: string,
  repo: string,
  token?: string,
  signal?: AbortSignal
): AsyncGenerator<{ type: 'progress'; msg: string } | { type: 'result'; data: CodeAnalysisResult }> {
  const concurrency = token ? 10 : 4
  const delayMs = token ? 20 : 100

  yield { type: 'progress', msg: '📁 [1/4] 获取文件结构...' }
  const tree = await fetchFileTree(owner, repo, token, signal)

  // Score and filter files
  yield { type: 'progress', msg: `📊 [2/4] 筛选关键文件 (共 ${tree.length} 个)...` }
  const candidates = tree
    .filter(f => f.size > 0 && f.size < 100000)
    .map(f => ({ entry: f, score: getFilePriority(f.path), size: f.size }))
    .sort((a, b) => b.score - a.score || b.size - a.size)
    .slice(0, 10) // 10 files per repo × 2 repos = ~22 subrequests (under 50 limit)

  yield { type: 'progress', msg: `📥 [3/4] 抓取 ${candidates.length} 个文件内容...` }

  // Fetch in batches with progress per batch
  const results: Record<string, string> = {}
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(c =>
        fetchFileContent(owner, repo, c.entry.path, token, signal)
          .then(content => [c.entry.path, content] as const)
      )
    )
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value[1]) {
        results[s.value[0]] = s.value[1]
      }
    }
    // Brief delay between batches to avoid rate limit
    if (i + concurrency < candidates.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  yield { type: 'progress', msg: '🧠 [4/4] 分析代码特征...' }
  const analysis = analyzeCodeFiles(results)

  yield { type: 'result', data: analysis }
}

function analyzeCodeFiles(files: Record<string, string>): CodeAnalysisResult {
  const paths = Object.keys(files)
  const result: CodeAnalysisResult = {
    language: '未知',
    packageManager: null,
    dependencyCount: 0,
    hasLockFile: false,
    hasTests: false,
    hasLinter: false,
    hasCI: false,
    hasDocker: false,
    hasAPI: false,
    topLevelDirs: [],
    keyFiles: [],
  }

  // Detect language and package manager
  if (files['package.json']) {
    try {
      const pkg = JSON.parse(files['package.json'])
      result.packageManager = 'npm'
      result.language = pkg.language || 'JavaScript/TypeScript'
      result.dependencyCount = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length
    } catch {}
  }
  if (files['go.mod']) {
    result.packageManager = 'go'
    result.language = 'Go'
    const matches = files['go.mod'].match(/^require\s+/gm)
    result.dependencyCount = matches ? matches.length : 0
  }
  if (files['Cargo.toml']) {
    result.packageManager = 'cargo'
    result.language = 'Rust'
    const matches = files['Cargo.toml'].match(/^\w+\s*=/gm)
    result.dependencyCount = matches ? matches.length : 0
  }
  if (files['pyproject.toml']) {
    result.packageManager = 'pip'
    result.language = 'Python'
    try {
      const cfg = files['pyproject.toml']
      const deps = cfg.match(/dependencies\s*=\s*\[([\s\S]*?)\]/m)
      if (deps) result.dependencyCount = (deps[1].match(/"/g) || []).length
    } catch {}
  }
  if (files['requirements.txt']) {
    result.packageManager = 'pip'
    result.language = 'Python'
    result.dependencyCount = files['requirements.txt'].split('\n').filter(l => l.trim() && !l.startsWith('#')).length
  }
  if (files['setup.py'] || files['setup.cfg']) {
    result.packageManager = 'pip'
    result.language = 'Python'
  }
  if (files['pom.xml']) {
    result.packageManager = 'maven'
    result.language = 'Java'
  }
  if (files['build.gradle']) {
    result.packageManager = 'gradle'
    result.language = 'Java/Kotlin'
  }

  // Lock files
  result.hasLockFile = paths.some(p =>
    p.includes('package-lock.json') || p.includes('yarn.lock') ||
    p.includes('pnpm-lock.yaml') || p.includes('go.sum') ||
    p.includes('Cargo.lock') || p.includes('poetry.lock')
  )

  // Tests
  result.hasTests = paths.some(p =>
    p.includes('/test/') || p.includes('/tests/') || p.includes('/__tests__/') ||
    p.includes('_test.') || p.includes('.test.') || p.includes('.spec.')
  )

  // Linters
  result.hasLinter = paths.some(p =>
    p.includes('.eslintrc') || p.includes('.prettierrc') ||
    p.includes('ruff.toml') || p.includes('pylintrc') ||
    p.includes('.golangci.yml') || p.includes('.pre-commit-config')
  )

  // CI
  result.hasCI = paths.some(p =>
    p.includes('.github/workflows') || p.includes('.gitlab-ci') ||
    p.includes('.circleci/') || p.includes('.travis.yml')
  )

  // Docker
  result.hasDocker = paths.some(p =>
    p === 'Dockerfile' || p.includes('docker-compose')
  )

  // API design
  result.hasAPI = paths.some(p =>
    p.endsWith('.proto') || p.endsWith('.graphql') || p.includes('openapi')
  )

  // Top-level directories
  const dirs = new Set<string>()
  for (const path of paths) {
    const parts = path.split('/')
    if (parts.length > 1) dirs.add(parts[0])
  }
  result.topLevelDirs = Array.from(dirs).slice(0, 10)
  result.keyFiles = paths.slice(0, 10)

  return result
}
