export const MAX_COPY_BYTES = 100_000

export function canCopyTextContents(byteLength: number, mimeHint: string): boolean {
  if (byteLength > MAX_COPY_BYTES) return false
  if (mimeHint.startsWith('text/')) return true
  if (mimeHint === 'application/json' || mimeHint === 'application/javascript') return true
  return false
}

export function mimeHintFromPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return 'application/javascript'
  }
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.md') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.css') ||
    lower.endsWith('.html') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.toml') ||
    lower.endsWith('.xml') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.sh') ||
    lower.endsWith('.py') ||
    lower.endsWith('.rs') ||
    lower.endsWith('.go')
  ) {
    return 'text/plain'
  }
  return 'application/octet-stream'
}
