import { contextBridge, ipcRenderer } from 'electron'
import type { PlatformId } from '../shared/platforms'
import type {
  AppConfig,
  DirEntry,
  PaneId,
  ReadTextResult,
  SearchHit,
  SessionActionResult,
  WorkspaceEntry,
  WorkspaceHealth,
} from '../shared/types'
import type { Account } from '../shared/types'

export type { PaneId, SessionActionResult }

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

const api: AiWrapperApi = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  onConfigUpdated: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AppConfig): void => {
      cb(config)
    }
    ipcRenderer.on('config:updated', listener)
    return () => ipcRenderer.removeListener('config:updated', listener)
  },
  addAccount: (platformId, label) => ipcRenderer.invoke('accounts:add', platformId, label),
  renameAccount: (platformId, accountId, label) =>
    ipcRenderer.invoke('accounts:rename', platformId, accountId, label),
  removeAccount: (platformId, accountId) =>
    ipcRenderer.invoke('accounts:remove', platformId, accountId),
  clearAccountSession: (platformId, accountId) =>
    ipcRenderer.invoke('accounts:clearSession', platformId, accountId),
  showAccount: (platformId, accountId) =>
    ipcRenderer.invoke('sessions:show', platformId, accountId),
  setSidebarWidth: (width) => ipcRenderer.invoke('prefs:setSidebarWidth', width),
  setSessionBounds: (bounds) => ipcRenderer.invoke('sessions:setBounds', bounds),
  addWorkspace: () => ipcRenderer.invoke('workspace:add'),
  removeWorkspace: (id) => ipcRenderer.invoke('workspace:remove', id),
  listDir: (relativeDir = '') => ipcRenderer.invoke('workspace:listDir', relativeDir),
  search: (query) => ipcRenderer.invoke('workspace:search', query),
  workspaceHealth: (workspacePath) => ipcRenderer.invoke('workspace:health', workspacePath),
  copyPath: (filePath) => ipcRenderer.invoke('assist:copyPath', filePath),
  copyContents: (filePath) => ipcRenderer.invoke('assist:copyContents', filePath),
  prepareAttach: (filePaths) => ipcRenderer.invoke('assist:prepareAttach', filePaths),
  confirm: (message) => ipcRenderer.invoke('ui:confirm', message),
}

contextBridge.exposeInMainWorld('api', api)
