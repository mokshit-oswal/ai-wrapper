export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'openai_platform'

export const PLATFORMS: Record<
  PlatformId,
  { id: PlatformId; label: string; url: string }
> = {
  chatgpt: { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com' },
  claude: { id: 'claude', label: 'Claude', url: 'https://claude.ai' },
  gemini: { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com' },
  openai_platform: {
    id: 'openai_platform',
    label: 'OpenAI Platform',
    url: 'https://platform.openai.com',
  },
}

export function platformIds(): PlatformId[] {
  return Object.keys(PLATFORMS) as PlatformId[]
}
