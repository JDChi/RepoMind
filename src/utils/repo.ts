const GITHUB_SLUG_REGEX = /^[a-zA-Z0-9._-]+$/

export function parseRepo(input: string): { owner: string; name: string } {
  const trimmed = input.trim()
  const match = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (match) return { owner: match[1], name: match[2] }
  const parts = trimmed.split('/')
  if (parts.length === 2 && parts[0] && parts[1]) return { owner: parts[0], name: parts[1] }
  throw new Error(`Invalid repo format: "${input}". Expected "owner/repo" or GitHub URL.`)
}

export function validateAndParseRepo(input: string): { owner: string; name: string } {
  const { owner, name } = parseRepo(input)
  if (!GITHUB_SLUG_REGEX.test(owner)) throw new Error(`Invalid owner name: "${owner}"`)
  if (!GITHUB_SLUG_REGEX.test(name)) throw new Error(`Invalid repo name: "${name}"`)
  return { owner, name }
}
