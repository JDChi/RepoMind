import { Hono } from 'hono'

type Env = {
  GITHUB_TOKEN?: string
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/search', async (c) => {
  const query = c.req.query('q')
  if (!query || query.length < 1) {
    return c.json({ items: [] })
  }

  const token = c.env.GITHUB_TOKEN
  if (!token) {
    return c.json({ error: 'No GitHub token configured' }, 500)
  }

  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'RepoMind',
          'Accept': 'application/vnd.github+json',
        },
      }
    )

    if (!res.ok) {
      return c.json({ error: `GitHub API error: ${res.status}` }, res.status)
    }

    const data = await res.json()
    return c.json({
      items: (data.items || []).map((item: any) => ({
        owner: item.owner.login,
        repo: item.name,
        description: item.description || '',
      }))
    })
  } catch (err) {
    return c.json({ error: 'Search failed' }, 500)
  }
})

export default app
