import { BrowserWindow, WebContentsView, session } from 'electron'
import type { Account } from '../shared/types'

type SessionKey = string

function keyFor(platformId: string, accountId: string): SessionKey {
  return `${platformId}::${accountId}`
}

export type ContentBounds = { x: number; y: number; width: number; height: number }

export class SessionManager {
  private readonly parent: BrowserWindow
  private readonly views = new Map<SessionKey, WebContentsView>()
  private readonly partitionByKey = new Map<SessionKey, string>()
  private activeKey: SessionKey | null = null
  private bounds: ContentBounds = { x: 320, y: 0, width: 800, height: 600 }

  constructor(parent: BrowserWindow) {
    this.parent = parent
  }

  setContentBounds(bounds: ContentBounds): void {
    this.bounds = bounds
    if (this.activeKey) {
      this.views.get(this.activeKey)?.setBounds(bounds)
    }
  }

  showAccount(platformId: string, account: Account, url: string): void {
    const key = keyFor(platformId, account.id)
    let view = this.views.get(key)
    if (!view) {
      view = this.createView(account, url)
      this.views.set(key, view)
      this.partitionByKey.set(key, account.partition)
      this.parent.contentView.addChildView(view)
    }
    for (const [k, v] of this.views) {
      if (k === key) {
        v.setBounds(this.bounds)
        // Prefer hide via zero-size offscreen instead of setVisible if unsupported
        try {
          v.setVisible(true)
        } catch {
          v.setBounds(this.bounds)
        }
      } else {
        try {
          v.setVisible(false)
        } catch {
          v.setBounds({ x: -10_000, y: -10_000, width: 0, height: 0 })
        }
      }
    }
    this.activeKey = key
  }

  getActiveWebContents() {
    if (!this.activeKey) return null
    return this.views.get(this.activeKey)?.webContents ?? null
  }

  async clearPartition(partition: string): Promise<void> {
    for (const [key, part] of [...this.partitionByKey.entries()]) {
      if (part !== partition) continue
      const view = this.views.get(key)
      if (view) {
        this.parent.contentView.removeChildView(view)
        view.webContents.close()
        this.views.delete(key)
      }
      this.partitionByKey.delete(key)
      if (this.activeKey === key) this.activeKey = null
    }

    const ses = session.fromPartition(partition)
    await ses.clearStorageData()
    await ses.clearCache()
  }

  disposeAccount(platformId: string, accountId: string): void {
    const key = keyFor(platformId, accountId)
    const view = this.views.get(key)
    if (!view) return
    this.parent.contentView.removeChildView(view)
    view.webContents.close()
    this.views.delete(key)
    this.partitionByKey.delete(key)
    if (this.activeKey === key) this.activeKey = null
  }

  private createView(account: Account, url: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        partition: account.partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    view.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition: account.partition,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    }))

    view.webContents.on('did-create-window', (child) => {
      child.setMenuBarVisibility(false)
    })

    void view.webContents.loadURL(url)
    return view
  }
}
