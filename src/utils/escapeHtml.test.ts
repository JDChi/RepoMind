import { describe, it, expect } from 'vitest'
import { escapeHtml } from './escapeHtml'

describe('escapeHtml', () => {
  it('escapes script tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })
  it('leaves normal text unchanged', () => {
    expect(escapeHtml('normal text')).toBe('normal text')
  })
  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })
  it('escapes angle brackets only (not quotes)', () => {
    expect(escapeHtml('"quoted"')).toBe('"quoted"')
  })
})
