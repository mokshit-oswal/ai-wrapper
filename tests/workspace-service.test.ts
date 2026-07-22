import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  searchFiles,
  readTextForCopy,
  isPathInsideWorkspace,
} from '../src/main/workspace-service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '../fixtures/workspace-sample')

describe('workspace-service', () => {
  it('rejects path escape', () => {
    expect(isPathInsideWorkspace('/etc/passwd', [root])).toBe(false)
  })

  it('finds hello.txt by name', () => {
    const hits = searchFiles([root], 'hello')
    expect(hits.some((h) => h.path.endsWith('hello.txt'))).toBe(true)
  })

  it('finds content matches', () => {
    const hits = searchFiles([root], 'zebra42')
    expect(hits.some((h) => h.matchType === 'content')).toBe(true)
  })

  it('copies small text; rejects binary', () => {
    const text = readTextForCopy(path.join(root, 'hello.txt'), [root])
    expect(text.ok).toBe(true)
    if (text.ok) expect(text.text).toContain('hello')
    const bin = readTextForCopy(path.join(root, 'binary.bin'), [root])
    expect(bin.ok).toBe(false)
  })
})
