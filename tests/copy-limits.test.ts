import { describe, it, expect } from 'vitest'
import { MAX_COPY_BYTES, canCopyTextContents } from '../src/shared/copy-limits'

describe('canCopyTextContents', () => {
  it('allows small text', () => {
    expect(canCopyTextContents(1000, 'text/plain')).toBe(true)
  })

  it('rejects over MAX_COPY_BYTES', () => {
    expect(canCopyTextContents(MAX_COPY_BYTES + 1, 'text/plain')).toBe(false)
  })

  it('rejects binary mime', () => {
    expect(canCopyTextContents(100, 'application/octet-stream')).toBe(false)
  })
})
