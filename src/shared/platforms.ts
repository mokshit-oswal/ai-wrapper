export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'groq'

export const PLATFORMS: Record<
  PlatformId,
  { id: PlatformId; label: string; url: string }
> = {
  chatgpt: { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com' },
  claude: { id: 'claude', label: 'Claude', url: 'https://claude.ai' },
  gemini: { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com' },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    url: 'https://www.perplexity.ai',
  },
  groq: { id: 'groq', label: 'Groq', url: 'https://chat.groq.com' },
}

export function platformIds(): PlatformId[] {
  return Object.keys(PLATFORMS) as PlatformId[]
}
