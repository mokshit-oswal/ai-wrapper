import type { AiWrapperApi } from '../../preload/index'

declare global {
  interface Window {
    api: AiWrapperApi
  }
}

export {}
