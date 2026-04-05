import { describe, it, expect } from 'vitest'
import { parseRepo, validateAndParseRepo } from './repo'

describe('parseRepo', () => {
  it('parses owner/repo format', () => {
    expect(parseRepo('vercel/ai')).toEqual({ owner: 'vercel', name: 'ai' })
  })
  it('parses GitHub URL', () => {
    expect(parseRepo('https://github.com/vercel/ai')).toEqual({ owner: 'vercel', name: 'ai' })
  })
  it('parses GitHub URL with query params', () => {
    expect(parseRepo('https://github.com/vercel/ai?tab=readme')).toEqual({ owner: 'vercel', name: 'ai' })
  })
  it('throws on missing slash', () => {
    expect(() => parseRepo('not-a-repo')).toThrow()
  })
  it('throws on empty string', () => {
    expect(() => parseRepo('')).toThrow()
  })
  it('parses GitHub URL with trailing slash', () => {
    expect(parseRepo('https://github.com/vercel/ai/')).toEqual({ owner: 'vercel', name: 'ai' })
  })
})

describe('validateAndParseRepo', () => {
  it('accepts valid slug', () => {
    expect(validateAndParseRepo('vercel/ai')).toEqual({ owner: 'vercel', name: 'ai' })
  })
  it('rejects path traversal in owner', () => {
    expect(() => validateAndParseRepo('owner/../etc/passwd')).toThrow()
  })
  it('rejects semicolons in repo name', () => {
    expect(() => validateAndParseRepo('owner/repo;rm -rf')).toThrow()
  })
  it('works with GitHub URL input', () => {
    expect(validateAndParseRepo('https://github.com/vercel/ai')).toEqual({ owner: 'vercel', name: 'ai' })
  })
  it('rejects owner starting with dot', () => {
    expect(() => validateAndParseRepo('.hidden/repo')).toThrow()
  })
})
