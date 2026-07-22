import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { attachWindow, createAppState, registerIpc } from './ipc'
import { SessionManager } from './session-manager'
import { PLATFORMS } from '../shared/platforms'
import { TOP_BAR_HEIGHT, clampSidebarWidth } from '../shared/layout'

if (process.env.AI_WRAPPER_USER_DATA) {
  app.setPath('userData', process.env.AI_WRAPPER_USER_DATA)
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function createWindow(ctx: ReturnType<typeof createAppState>): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'AI Wrapper',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const sessions = new SessionManager(win)
  attachWindow(ctx, win, sessions)

  const layoutSessions = (): void => {
    const [width, height] = win.getContentSize()
    const sidebarWidth = clampSidebarWidth(ctx.getConfig().prefs.sidebarWidth)
    sessions.setContentBounds({
      x: sidebarWidth,
      y: TOP_BAR_HEIGHT,
      width: Math.max(100, width - sidebarWidth),
      height: Math.max(100, height - TOP_BAR_HEIGHT),
    })
  }

  win.on('resize', layoutSessions)
  layoutSessions()

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
    layoutSessions()
    const config = ctx.getConfig()
    const { lastPlatform, lastAccountId } = config.prefs
    if (!lastAccountId) return
    const account = config.platforms[lastPlatform].accounts.find((a) => a.id === lastAccountId)
    if (!account) return
    sessions.showAccount(lastPlatform, account, PLATFORMS[lastPlatform].url)
  })

  return win
}

app.whenReady().then(() => {
  const ctx = createAppState(configPath())
  registerIpc(ctx)
  createWindow(ctx)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(ctx)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
