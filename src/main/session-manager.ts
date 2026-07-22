import { BrowserWindow, WebContentsView, session } from 'electron'
import type { Account } from '../shared/types'
import { clampSplitRatio, computeSplitBounds, type Rect } from './split-layout'

type SessionKey = string
export type PaneId = 'left' | 'right'

function keyFor(platformId: string, accountId: string): SessionKey {
  return `${platformId}::${accountId}`
}

export type ContentBounds = Rect

export type SetPaneResult = { ok: true } | { ok: false; reason: string }

export class SessionManager {
  private readonly parent: BrowserWindow
  private readonly views = new Map<SessionKey, WebContentsView>()
  private readonly partitionByKey = new Map<SessionKey, string>()
  private leftKey: SessionKey | null = null
  private rightKey: SessionKey | null = null
  private focusedPane: PaneId = 'left'
  private split = false
  private splitRatio = 0.5
  private bounds: ContentBounds = { x: 320, y: 0, width: 800, height: 600 }

  constructor(parent: BrowserWindow) {
    this.parent = parent
  }

  isSplit(): boolean {
    return this.split
  }

  getFocusedPane(): PaneId {
    return this.focusedPane
  }

  getSplitRatio(): number {
    return this.splitRatio
  }

  setContentBounds(bounds: ContentBounds): void {
    this.bounds = bounds
    this.applyLayout()
  }

  enterSplit(): boolean {
    if (!this.leftKey) return false
    this.split = true
    this.splitRatio = 0.5
    this.focusedPane = 'right'
    this.applyLayout()
    return true
  }

  exitSplit(): void {
    if (!this.split) return
    this.split = false
    this.rightKey = null
    this.focusedPane = 'left'
    this.applyLayout()
  }

  focusPane(pane: PaneId): void {
    if (!this.split && pane === 'right') return
    this.focusedPane = pane
    const key = pane === 'left' ? this.leftKey : this.rightKey
    if (key) {
      this.views.get(key)?.webContents.focus()
    }
  }

  setSplitRatio(ratio: number): void {
    if (!this.split) return
    this.splitRatio = clampSplitRatio(ratio, this.bounds.width)
    this.applyLayout()
  }

  setPane(
    pane: PaneId,
    platformId: string,
    account: Account,
    url: string,
  ): SetPaneResult {
    if (pane === 'right' && !this.split) {
      return { ok: false, reason: 'Not in split mode' }
    }
    const key = keyFor(platformId, account.id)
    const other = pane === 'left' ? this.rightKey : this.leftKey
    if (other === key) {
      return { ok: false, reason: 'That account is already open in the other pane' }
    }

    this.ensureView(key, account, url)
    if (pane === 'left') this.leftKey = key
    else this.rightKey = key
    this.focusedPane = pane
    this.applyLayout()
    return { ok: true }
  }

  showAccount(platformId: string, account: Account, url: string): SetPaneResult {
    if (this.split) {
      return this.setPane(this.focusedPane, platformId, account, url)
    }
    return this.setPane('left', platformId, account, url)
  }

  getActiveWebContents() {
    const key = this.focusedPane === 'right' && this.split ? this.rightKey : this.leftKey
    if (!key) return null
    return this.views.get(key)?.webContents ?? null
  }

  async clearPartition(partition: string): Promise<void> {
    for (const [key, part] of [...this.partitionByKey.entries()]) {
      if (part !== partition) continue
      this.disposeKey(key)
    }

    const ses = session.fromPartition(partition)
    await ses.clearStorageData()
    await ses.clearCache()
  }

  disposeAccount(platformId: string, accountId: string): void {
    this.disposeKey(keyFor(platformId, accountId))
  }

  private disposeKey(key: SessionKey): void {
    const view = this.views.get(key)
    if (view) {
      this.parent.contentView.removeChildView(view)
      view.webContents.close()
      this.views.delete(key)
    }
    this.partitionByKey.delete(key)

    if (this.leftKey === key) this.leftKey = null
    if (this.rightKey === key) this.rightKey = null

    if (this.split && !this.leftKey) {
      this.exitSplit()
    } else {
      this.applyLayout()
    }
  }

  private ensureView(key: SessionKey, account: Account, url: string): WebContentsView {
    let view = this.views.get(key)
    if (!view) {
      view = this.createView(account, url)
      this.views.set(key, view)
      this.partitionByKey.set(key, account.partition)
      this.parent.contentView.addChildView(view)
    }
    return view
  }

  private applyLayout(): void {
    const visible = new Set<SessionKey>()
    if (this.split && this.leftKey && this.rightKey) {
      const { left, right } = computeSplitBounds(this.bounds, this.splitRatio)
      this.showKey(this.leftKey, left)
      this.showKey(this.rightKey, right)
      visible.add(this.leftKey)
      visible.add(this.rightKey)
    } else if (this.split && this.leftKey && !this.rightKey) {
      // Waiting for right pane assignment — show left half only
      const { left } = computeSplitBounds(this.bounds, this.splitRatio)
      this.showKey(this.leftKey, left)
      visible.add(this.leftKey)
    } else if (this.leftKey) {
      this.showKey(this.leftKey, this.bounds)
      visible.add(this.leftKey)
    }

    for (const [k, v] of this.views) {
      if (visible.has(k)) continue
      this.hideView(v)
    }
  }

  private showKey(key: SessionKey, rect: Rect): void {
    const view = this.views.get(key)
    if (!view) return
    view.setBounds(rect)
    try {
      view.setVisible(true)
    } catch {
      view.setBounds(rect)
    }
  }

  private hideView(view: WebContentsView): void {
    try {
      view.setVisible(false)
    } catch {
      view.setBounds({ x: -10_000, y: -10_000, width: 0, height: 0 })
    }
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
