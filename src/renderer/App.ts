import './styles.css'
import { PLATFORMS, platformIds, type PlatformId } from '../shared/platforms'
import type { AppConfig, DirEntry, SearchHit } from '../shared/types'

export const SIDEBAR_WIDTH = 320

export async function mountApp(root: HTMLElement): Promise<void> {
  if (!window.api) {
    root.innerHTML = `<p style="padding:16px;color:#b42318">Shell API failed to load (preload). Restart the app.</p>`
    throw new Error('window.api is missing — preload did not load')
  }

  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div>
          <h1 style="margin:0;font-size:16px;">AI Wrapper</h1>
          <p class="status" id="status">Ready</p>
        </div>
        <section class="platforms">
          <h2 class="section-title">Platforms</h2>
          <div id="platform-list"></div>
        </section>
        <section class="accounts">
          <h2 class="section-title">Accounts</h2>
          <div id="account-list"></div>
          <div class="inline-form" id="account-form">
            <input type="text" id="account-label" placeholder="Account label" value="Personal" />
            <div class="row">
              <button class="action primary" id="add-account" type="button">Add account</button>
              <button class="action" id="rename-account" type="button">Rename</button>
              <button class="action danger" id="remove-account" type="button">Remove</button>
              <button class="action danger" id="clear-session" type="button">Clear session</button>
            </div>
          </div>
        </section>
        <section class="workspace">
          <h2 class="section-title">Workspace</h2>
          <div id="workspace-list"></div>
          <div class="row">
            <button class="action" id="add-workspace" type="button">Add folder</button>
            <button class="action danger" id="remove-workspace" type="button">Remove folder</button>
          </div>
          <input type="search" id="search" placeholder="Search files…" />
          <div class="list" id="file-list"></div>
          <div class="row">
            <button class="action" id="copy-path" type="button">Copy path</button>
            <button class="action" id="copy-contents" type="button">Copy contents</button>
            <button class="action" id="prepare-attach" type="button">Prepare attach</button>
          </div>
        </section>
      </aside>
      <div class="webview-slot" id="webview-slot" aria-hidden="true"></div>
    </div>
  `

  let config: AppConfig = await window.api.getConfig()
  let platformId: PlatformId = config.prefs.lastPlatform
  let accountId: string | null = config.prefs.lastAccountId
  let selectedWorkspaceId: string | null = config.workspaces[0]?.id ?? null
  let selectedFile: string | null = null
  let fileRows: Array<{ path: string; label: string }> = []

  const statusEl = root.querySelector('#status') as HTMLElement
  const labelInput = root.querySelector('#account-label') as HTMLInputElement

  function setStatus(msg: string): void {
    statusEl.textContent = msg
  }

  function reportBounds(): void {
    const height = window.innerHeight
    const width = Math.max(100, window.innerWidth - SIDEBAR_WIDTH)
    void window.api.setSessionBounds({ x: SIDEBAR_WIDTH, y: 0, width, height })
  }

  async function refreshHealth(container: HTMLElement): Promise<void> {
    for (const ws of config.workspaces) {
      const health = await window.api.workspaceHealth(ws.path)
      const el = container.querySelector(`[data-ws="${ws.id}"] .health`)
      if (el) {
        el.textContent = health === 'ok' ? '' : ` (${health})`
        el.className = health === 'ok' ? 'health' : 'health health-bad'
      }
    }
  }

  function renderPlatforms(): void {
    const list = root.querySelector('#platform-list')!
    list.innerHTML = platformIds()
      .map((id) => {
        const p = PLATFORMS[id]
        const active = id === platformId ? 'active' : ''
        return `<button type="button" class="platform-btn ${active}" data-id="${id}">${p.label}</button>`
      })
      .join('')
    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        platformId = (btn as HTMLButtonElement).dataset.id as PlatformId
        accountId = config.platforms[platformId].accounts[0]?.id ?? null
        const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
        labelInput.value = selected?.label ?? 'Personal'
        render()
        if (accountId) void window.api.showAccount(platformId, accountId)
      })
    })
  }

  function renderAccounts(): void {
    const list = root.querySelector('#account-list')!
    const accounts = config.platforms[platformId].accounts
    if (accounts.length === 0) {
      list.innerHTML = `<p class="status">No accounts yet. Enter a label and click Add account.</p>`
      return
    }
    list.innerHTML = accounts
      .map((a) => {
        const active = a.id === accountId ? 'active' : ''
        return `<button type="button" class="account-btn ${active}" data-id="${a.id}">${escapeHtml(a.label)}</button>`
      })
      .join('')
    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        accountId = (btn as HTMLButtonElement).dataset.id!
        const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
        labelInput.value = selected?.label ?? 'Personal'
        try {
          await window.api.showAccount(platformId, accountId)
          setStatus(`Showing ${PLATFORMS[platformId].label}`)
        } catch (err) {
          setStatus(`Failed to show account: ${String(err)}`)
        }
        render()
      })
    })
  }

  function renderWorkspaces(): void {
    const list = root.querySelector('#workspace-list')!
    if (config.workspaces.length === 0) {
      list.innerHTML = `<p class="status">No folders granted.</p>`
      return
    }
    list.innerHTML = config.workspaces
      .map((w) => {
        const active = w.id === selectedWorkspaceId ? 'active' : ''
        return `<button type="button" class="account-btn ${active}" data-ws="${w.id}">${escapeHtml(w.path)}<span class="health"></span></button>`
      })
      .join('')
    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedWorkspaceId = (btn as HTMLButtonElement).dataset.ws!
        void loadFiles()
        renderWorkspaces()
      })
    })
    void refreshHealth(list as HTMLElement)
  }

  async function loadFiles(query = ''): Promise<void> {
    const box = root.querySelector('#file-list')!
    try {
      if (query.trim()) {
        const hits: SearchHit[] = await window.api.search(query.trim())
        fileRows = hits.map((h) => ({
          path: h.path,
          label: `${h.matchType}: ${h.path}`,
        }))
      } else {
        const entries: DirEntry[] = await window.api.listDir('')
        fileRows = entries.map((e) => ({
          path: e.path,
          label: `${e.isDirectory ? '[dir] ' : ''}${e.name}`,
        }))
      }
    } catch (err) {
      setStatus(`Workspace error: ${String(err)}`)
      fileRows = []
    }
    box.innerHTML = fileRows
      .map(
        (r) =>
          `<button type="button" data-path="${escapeAttr(r.path)}" class="${r.path === selectedFile ? 'selected' : ''}">${escapeHtml(r.label)}</button>`,
      )
      .join('')
    box.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedFile = (btn as HTMLButtonElement).dataset.path!
        void loadFiles((root.querySelector('#search') as HTMLInputElement).value)
      })
    })
  }

  function render(): void {
    renderPlatforms()
    renderAccounts()
    renderWorkspaces()
  }

  root.querySelector('#add-account')!.addEventListener('click', async () => {
    const label = labelInput.value.trim() || 'Personal'
    const btn = root.querySelector('#add-account') as HTMLButtonElement
    btn.disabled = true
    try {
      const account = await window.api.addAccount(platformId, label)
      accountId = account.id
      config = await window.api.getConfig()
      reportBounds()
      await window.api.showAccount(platformId, accountId)
      setStatus(`Added “${account.label}” — sign in with Google in the webview`)
      render()
    } catch (err) {
      setStatus(`Add account failed: ${String(err)}`)
      console.error(err)
    } finally {
      btn.disabled = false
    }
  })

  root.querySelector('#rename-account')!.addEventListener('click', async () => {
    if (!accountId) {
      setStatus('Select an account to rename')
      return
    }
    const label = labelInput.value.trim()
    if (!label) {
      setStatus('Enter a label first')
      return
    }
    try {
      await window.api.renameAccount(platformId, accountId, label)
      config = await window.api.getConfig()
      setStatus('Account renamed')
      render()
    } catch (err) {
      setStatus(`Rename failed: ${String(err)}`)
    }
  })

  root.querySelector('#remove-account')!.addEventListener('click', async () => {
    if (!accountId) {
      setStatus('Select an account to remove')
      return
    }
    const current = config.platforms[platformId].accounts.find((a) => a.id === accountId)
    if (!(await window.api.confirm(`Remove account “${current?.label ?? ''}” and its saved session?`))) {
      return
    }
    try {
      await window.api.removeAccount(platformId, accountId)
      config = await window.api.getConfig()
      accountId = config.platforms[platformId].accounts[0]?.id ?? null
      labelInput.value =
        config.platforms[platformId].accounts.find((a) => a.id === accountId)?.label ?? 'Personal'
      setStatus('Account removed')
      render()
      if (accountId) await window.api.showAccount(platformId, accountId)
    } catch (err) {
      setStatus(`Remove failed: ${String(err)}`)
    }
  })

  root.querySelector('#clear-session')!.addEventListener('click', async () => {
    if (!accountId) {
      setStatus('Select an account first')
      return
    }
    if (!(await window.api.confirm('Clear cookies/storage for this account?'))) return
    try {
      await window.api.clearAccountSession(platformId, accountId)
      reportBounds()
      await window.api.showAccount(platformId, accountId)
      setStatus('Session cleared — sign in again')
    } catch (err) {
      setStatus(`Clear session failed: ${String(err)}`)
    }
  })

  root.querySelector('#add-workspace')!.addEventListener('click', async () => {
    try {
      const ws = await window.api.addWorkspace()
      config = await window.api.getConfig()
      if (ws) selectedWorkspaceId = ws.id
      await loadFiles()
      render()
      setStatus(ws ? 'Folder added' : 'Add folder canceled')
    } catch (err) {
      setStatus(`Add folder failed: ${String(err)}`)
    }
  })

  root.querySelector('#remove-workspace')!.addEventListener('click', async () => {
    if (!selectedWorkspaceId) {
      setStatus('Select a folder to remove')
      return
    }
    try {
      await window.api.removeWorkspace(selectedWorkspaceId)
      config = await window.api.getConfig()
      selectedWorkspaceId = config.workspaces[0]?.id ?? null
      await loadFiles()
      render()
      setStatus('Folder removed')
    } catch (err) {
      setStatus(`Remove folder failed: ${String(err)}`)
    }
  })

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  root.querySelector('#search')!.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void loadFiles(q), 200)
  })

  root.querySelector('#copy-path')!.addEventListener('click', async () => {
    if (!selectedFile) return setStatus('Select a file first')
    await window.api.copyPath(selectedFile)
    setStatus('Path copied')
  })

  root.querySelector('#copy-contents')!.addEventListener('click', async () => {
    if (!selectedFile) return setStatus('Select a file first')
    const result = await window.api.copyContents(selectedFile)
    setStatus(result.ok ? 'Contents copied' : result.reason)
  })

  root.querySelector('#prepare-attach')!.addEventListener('click', async () => {
    if (!selectedFile) return setStatus('Select a file first')
    const result = await window.api.prepareAttach([selectedFile])
    setStatus(result.ok ? result.message : result.reason)
  })

  window.api.onConfigUpdated((next) => {
    config = next
    render()
  })

  window.addEventListener('resize', reportBounds)
  reportBounds()
  render()
  await loadFiles()

  if (accountId) {
    const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
    labelInput.value = selected?.label ?? 'Personal'
    reportBounds()
    await window.api.showAccount(platformId, accountId)
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}
