import { BrowserWindow, clipboard, dialog, ipcMain, shell, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { addAccount, findAccount, removeAccount, renameAccount } from './account-service'
import { loadConfig, saveConfig } from './config-store'
import { SessionManager } from './session-manager'
import { clampSidebarWidth } from '../shared/layout'
import { PLATFORMS, type PlatformId, platformIds } from '../shared/platforms'
import type { AppConfig } from '../shared/types'
import {
  addWorkspace,
  listDir,
  readTextForCopy,
  removeWorkspace,
  searchFiles,
  workspaceHealth,
} from './workspace-service'

export type AppContext = {
  getWindow: () => BrowserWindow | null
  getSessions: () => SessionManager | null
  getConfig: () => AppConfig
  setConfig: (config: AppConfig) => void
  persist: () => void
  broadcastConfig: () => void
  attach: (window: BrowserWindow, sessions: SessionManager) => void
}

export function createAppState(configPath: string): AppContext {
  let config = loadConfig(configPath)
  let mainWindow: BrowserWindow | null = null
  let sessions: SessionManager | null = null

  return {
    getWindow: () => mainWindow,
    getSessions: () => sessions,
    getConfig: () => config,
    setConfig: (next) => {
      config = next
    },
    persist: () => saveConfig(configPath, config),
    broadcastConfig: () => {
      mainWindow?.webContents.send('config:updated', config)
    },
    attach: (window, sessionManager) => {
      mainWindow = window
      sessions = sessionManager
    },
  }
}

export function attachWindow(
  ctx: AppContext,
  window: BrowserWindow,
  sessions: SessionManager,
): void {
  ctx.attach(window, sessions)
}

export function registerIpc(ctx: AppContext): void {
  ipcMain.handle('ui:confirm', async (_e, message: string) => {
    const win = ctx.getWindow()
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      cancelId: 0,
      message,
    }
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    return result.response === 1
  })

  ipcMain.handle('config:get', () => ctx.getConfig())

  ipcMain.handle('accounts:add', (_e, platformId: PlatformId, label: string) => {
    if (!platformIds().includes(platformId)) throw new Error('Invalid platform')
    const result = addAccount(ctx.getConfig(), platformId, label)
    ctx.setConfig(result.config)
    ctx.persist()
    ctx.broadcastConfig()
    return result.account
  })

  ipcMain.handle(
    'accounts:rename',
    (_e, platformId: PlatformId, accountId: string, label: string) => {
      ctx.setConfig(renameAccount(ctx.getConfig(), platformId, accountId, label))
      ctx.persist()
      ctx.broadcastConfig()
      return true
    },
  )

  ipcMain.handle('accounts:remove', async (_e, platformId: PlatformId, accountId: string) => {
    const account = findAccount(ctx.getConfig(), platformId, accountId)
    if (account) {
      ctx.getSessions()?.disposeAccount(platformId, accountId)
      await ctx.getSessions()?.clearPartition(account.partition)
    }
    ctx.setConfig(removeAccount(ctx.getConfig(), platformId, accountId))
    ctx.persist()
    ctx.broadcastConfig()
    return true
  })

  ipcMain.handle('accounts:clearSession', async (_e, platformId: PlatformId, accountId: string) => {
    const account = findAccount(ctx.getConfig(), platformId, accountId)
    if (!account) return false
    ctx.getSessions()?.disposeAccount(platformId, accountId)
    await ctx.getSessions()?.clearPartition(account.partition)
    return true
  })

  ipcMain.handle('sessions:show', (_e, platformId: PlatformId, accountId: string) => {
    const account = findAccount(ctx.getConfig(), platformId, accountId)
    if (!account) return { ok: false as const, reason: 'Account not found' }
    const platform = PLATFORMS[platformId]
    ctx.getSessions()?.showAccount(platformId, account, platform.url)
    const prev = ctx.getConfig()
    ctx.setConfig({
      ...prev,
      prefs: {
        ...prev.prefs,
        lastPlatform: platformId,
        lastAccountId: accountId,
        lastAccountIdByPlatform: {
          ...prev.prefs.lastAccountIdByPlatform,
          [platformId]: accountId,
        },
      },
    })
    ctx.persist()
    ctx.broadcastConfig()
    return true
  })

  ipcMain.handle('prefs:setSidebarWidth', (_e, width: number) => {
    const sidebarWidth = clampSidebarWidth(width)
    const prev = ctx.getConfig()
    ctx.setConfig({
      ...prev,
      prefs: { ...prev.prefs, sidebarWidth },
    })
    ctx.persist()
    ctx.broadcastConfig()
    return sidebarWidth
  })

  ipcMain.handle(
    'sessions:setBounds',
    (_e, bounds: { x: number; y: number; width: number; height: number }) => {
      ctx.getSessions()?.setContentBounds(bounds)
      return true
    },
  )

  ipcMain.handle('workspace:add', async () => {
    const win = ctx.getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    ctx.setConfig(addWorkspace(ctx.getConfig(), result.filePaths[0]))
    ctx.persist()
    ctx.broadcastConfig()
    return ctx.getConfig().workspaces.at(-1) ?? null
  })

  ipcMain.handle('workspace:remove', (_e, id: string) => {
    ctx.setConfig(removeWorkspace(ctx.getConfig(), id))
    ctx.persist()
    ctx.broadcastConfig()
    return true
  })

  ipcMain.handle('workspace:listDir', (_e, relativeDir: string) => {
    const roots = ctx.getConfig().workspaces.map((w) => w.path)
    return listDir(roots, relativeDir)
  })

  ipcMain.handle('workspace:search', (_e, query: string) => {
    const roots = ctx.getConfig().workspaces.map((w) => w.path)
    return searchFiles(roots, query)
  })

  ipcMain.handle('workspace:health', (_e, workspacePath: string) => workspaceHealth(workspacePath))

  ipcMain.handle('assist:copyPath', (_e, filePath: string) => {
    clipboard.writeText(filePath)
    return true
  })

  ipcMain.handle('assist:copyContents', (_e, filePath: string) => {
    const roots = ctx.getConfig().workspaces.map((w) => w.path)
    const result = readTextForCopy(filePath, roots)
    if (!result.ok) return result
    clipboard.writeText(result.text)
    return result
  })

  ipcMain.handle('assist:prepareAttach', async (_e, filePaths: string[]) => {
    const roots = ctx.getConfig().workspaces.map((w) => w.path)
    const allowed = filePaths.filter((p) => {
      const resolved = path.resolve(p)
      return roots.some((root) => {
        const rel = path.relative(path.resolve(root), resolved)
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
      })
    })
    if (allowed.length === 0) {
      return { ok: false as const, reason: 'No files inside granted workspaces' }
    }

    const stageRoot = path.join(app.getPath('userData'), 'attach-staging')
    fs.rmSync(stageRoot, { recursive: true, force: true })
    fs.mkdirSync(stageRoot, { recursive: true })

    const staged: string[] = []
    for (const src of allowed) {
      const dest = path.join(stageRoot, path.basename(src))
      fs.copyFileSync(src, dest)
      staged.push(dest)
    }

    clipboard.writeText(staged[0])
    await shell.openPath(stageRoot)
    ctx.getSessions()?.getActiveWebContents()?.focus()

    return {
      ok: true as const,
      stagedDir: stageRoot,
      staged,
      message:
        'Files staged and folder opened. Use the site’s upload control and pick from the staging folder (first path is on the clipboard).',
    }
  })
}
