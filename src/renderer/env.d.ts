import type { PlatformId } from '../shared/platforms'
import type {
  Account,
  AppConfig,
  DirEntry,
  ReadTextResult,
  SearchHit,
  WorkspaceEntry,
  WorkspaceHealth,
} from '../shared/types'

export type AiWrapperApi = {
  getConfig: () => Promise<AppConfig>
  onConfigUpdated: (cb: (config: AppConfig) => void) => () => void
  addAccount: (platformId: PlatformId, label: string) => Promise<Account>
  renameAccount: (platformId: PlatformId, accountId: string, label: string) => Promise<boolean>
  removeAccount: (platformId: PlatformId, accountId: string) => Promise<boolean>
  clearAccountSession: (platformId: PlatformId, accountId: string) => Promise<boolean>
  showAccount: (platformId: PlatformId, accountId: string) => Promise<boolean>
  setSidebarWidth: (width: number) => Promise<number>
  setSessionBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<boolean>
  addWorkspace: () => Promise<WorkspaceEntry | null>
  removeWorkspace: (id: string) => Promise<boolean>
  listDir: (relativeDir?: string) => Promise<DirEntry[]>
  search: (query: string) => Promise<SearchHit[]>
  workspaceHealth: (workspacePath: string) => Promise<WorkspaceHealth>
  copyPath: (filePath: string) => Promise<boolean>
  copyContents: (filePath: string) => Promise<ReadTextResult>
  prepareAttach: (
    filePaths: string[],
  ) => Promise<
    | { ok: true; stagedDir: string; staged: string[]; message: string }
    | { ok: false; reason: string }
  >
  confirm: (message: string) => Promise<boolean>
}

declare global {
  interface Window {
    api: AiWrapperApi
  }
}

export {}
