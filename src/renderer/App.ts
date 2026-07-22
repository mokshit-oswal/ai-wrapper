import './styles.css'
import {
  flattenAccounts,
  formatAccountLabel,
  resolveAccountForPlatform,
} from '../shared/accounts-view'
import { TOP_BAR_HEIGHT, clampSidebarWidth } from '../shared/layout'
import { PLATFORMS, platformIds, type PlatformId } from '../shared/platforms'
import type { AppConfig, DirEntry, SearchHit, PaneId } from '../shared/types'

export async function mountApp(root: HTMLElement): Promise<void> {
  if (!window.api) {
    root.innerHTML = `<p style="padding:16px;color:#b42318">Shell API failed to load (preload). Restart the app.</p>`
    throw new Error('window.api is missing — preload did not load')
  }

  root.innerHTML = `
    <div class="shell">
      <header class="topbar" id="topbar">
        <div class="topbar-brand">AI Wrapper</div>
        <label class="topbar-field">
          <span>Platform</span>
          <select id="add-platform"></select>
        </label>
        <input type="text" id="account-label" placeholder="Account label" value="Personal" />
        <button class="action primary" id="add-account" type="button">Add</button>
        <button class="action" id="rename-account" type="button">Rename</button>
        <button class="action danger" id="remove-account" type="button">Remove</button>
        <button class="action danger" id="clear-session" type="button">Clear session</button>
        <p class="status" id="status">Ready</p>
      </header>
      <div class="shell-body">
        <aside class="sidebar" id="sidebar">
          <section class="platforms">
            <h2 class="section-title">Platforms</h2>
            <div id="platform-list"></div>
          </section>
          <section class="accounts">
            <h2 class="section-title">All accounts</h2>
            <div id="account-list"></div>
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
        <div class="resize-handle" id="resize-handle" role="separator" aria-orientation="vertical"></div>
        <div class="webview-slot" id="webview-slot" aria-hidden="true"></div>
      </div>
    </div>
  `

  let config: AppConfig = await window.api.getConfig()
  let sidebarWidth = clampSidebarWidth(config.prefs.sidebarWidth)
  let platformId: PlatformId = config.prefs.lastPlatform
  let accountId: string | null = config.prefs.lastAccountId
  let selectedWorkspaceId: string | null = config.workspaces[0]?.id ?? null
  let selectedFile: string | null = null
  let fileRows: Array<{ path: string; label: string }> = []

  let splitActive = false
  let focusedPane: PaneId = 'left'
  let splitRatio = 0.5
  let leftPane: PaneSession | null =
    accountId ? { platformId, accountId } : null
  let rightPane: PaneSession | null = null

  const statusEl = root.querySelector('#status') as HTMLElement
  const labelInput = root.querySelector('#account-label') as HTMLInputElement
  const addPlatformSelect = root.querySelector('#add-platform') as HTMLSelectElement

  addPlatformSelect.innerHTML = platformIds()
    .map((id) => `<option value="${id}">${PLATFORMS[id].label}</option>`)
    .join('')
  addPlatformSelect.value = platformId

  function setStatus(msg: string): void {
    statusEl.textContent = msg
  }

  function reportBounds(): void {
    const height = Math.max(100, window.innerHeight - TOP_BAR_HEIGHT)
    const width = Math.max(100, window.innerWidth - sidebarWidth)
    void window.api.setSessionBounds({
      x: sidebarWidth,
      y: TOP_BAR_HEIGHT,
      width,
      height,
    })
  }

  function applySidebarWidth(px: number): void {
    sidebarWidth = clampSidebarWidth(px)
    root.style.setProperty('--sidebar', `${sidebarWidth}px`)
    reportBounds()
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
        const resolved = resolveAccountForPlatform(config, platformId)
        accountId = resolved?.id ?? null
        labelInput.value = resolved?.label ?? 'Personal'
        addPlatformSelect.value = platformId
        render()
        if (accountId) void showAccountUi(platformId, accountId)
      })
    })
  }

  async function showAccountUi(nextPlatform: PlatformId, nextAccountId: string): Promise<void> {
    const result = await window.api.showAccount(nextPlatform, nextAccountId)
    if (!result.ok) {
      setStatus(result.reason)
      return
    }
    platformId = nextPlatform
    accountId = nextAccountId
    const session = { platformId: nextPlatform, accountId: nextAccountId }
    if (!splitActive || focusedPane === 'left') leftPane = session
    else rightPane = session
    setStatus(`Showing ${PLATFORMS[nextPlatform].label}`)
    render()
    renderSplitChrome()
  }

  function renderAccounts(): void {
    const list = root.querySelector('#account-list')!
    const flat = flattenAccounts(config)
    if (flat.length === 0) {
      list.innerHTML = `<p class="status">No accounts yet. Choose a platform, enter a label, and click Add.</p>`
      return
    }
    list.innerHTML = flat
      .map(({ platformId: pid, account: a }) => {
        const active = a.id === accountId && pid === platformId ? 'active' : ''
        const text = formatAccountLabel(pid, a.label)
        return `<button type="button" class="account-btn ${active}" data-id="${a.id}" data-platform="${pid}">${escapeHtml(text)}</button>`
      })
      .join('')
    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        platformId = (btn as HTMLButtonElement).dataset.platform as PlatformId
        accountId = (btn as HTMLButtonElement).dataset.id!
        const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
        labelInput.value = selected?.label ?? 'Personal'
        addPlatformSelect.value = platformId
        try {
          await window.api.showAccount(platformId, accountId)
          setStatus(`Showing ${formatAccountLabel(platformId, selected?.label ?? '')}`)
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

  splitToggle.addEventListener('click', async () => {
    if (splitActive) {
      await window.api.exitSplit()
      splitActive = false
      rightPane = null
      focusedPane = 'left'
      if (leftPane) {
        platformId = leftPane.platformId
        accountId = leftPane.accountId
        const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
        labelInput.value = selected?.label ?? 'Personal'
      }
      closeRightPicker()
      setStatus('Exited split — left pane kept')
      render()
      renderSplitChrome()
      return
    }

    if (!accountId || !leftPane) {
      setStatus('Select an account before splitting')
      return
    }
    leftPane = { platformId, accountId }
    const ok = await window.api.enterSplit()
    if (!ok) {
      setStatus('Could not enter split')
      return
    }
    splitActive = true
    splitRatio = 0.5
    focusedPane = 'right'
    rightPane = null
    setStatus('Pick an account for the right pane')
    renderSplitChrome()
    openRightPicker()
  })

  pickerPlatform.addEventListener('change', () => fillPickerAccounts())

  root.querySelector('#picker-cancel')!.addEventListener('click', async () => {
    closeRightPicker()
    await window.api.exitSplit()
    splitActive = false
    rightPane = null
    focusedPane = 'left'
    setStatus('Split canceled')
    renderSplitChrome()
  })

  root.querySelector('#picker-confirm')!.addEventListener('click', async () => {
    const pid = pickerPlatform.value as PlatformId
    const aid = pickerAccount.value
    if (!aid) {
      setStatus('Choose an account for the right pane')
      return
    }
    const ok = await assignPane('right', pid, aid)
    if (ok) closeRightPicker()
  })

  const divider = root.querySelector('#split-divider') as HTMLElement
  let dragging = false
  divider.addEventListener('pointerdown', (e) => {
    if (!splitActive) return
    dragging = true
    divider.setPointerCapture(e.pointerId)
  })
  divider.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const main = root.querySelector('.main-column') as HTMLElement
    const rect = main.getBoundingClientRect()
    const x = e.clientX - rect.left
    const next = Math.min(0.85, Math.max(0.15, x / rect.width))
    splitRatio = next
    syncSplitHeadersLayout()
    void window.api.setSplitRatio(next)
  })
  divider.addEventListener('pointerup', () => {
    dragging = false
  })
  divider.addEventListener('pointercancel', () => {
    dragging = false
  })

  root.querySelector('#add-account')!.addEventListener('click', async () => {
    const label = labelInput.value.trim() || 'Personal'
    const targetPlatform = addPlatformSelect.value as PlatformId
    const btn = root.querySelector('#add-account') as HTMLButtonElement
    btn.disabled = true
    try {
      const account = await window.api.addAccount(targetPlatform, label)
      platformId = targetPlatform
      accountId = account.id
      config = await window.api.getConfig()
      reportBounds()
      await showAccountUi(platformId, account.id)
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
      renderSplitChrome()
    } catch (err) {
      setStatus(`Rename failed: ${String(err)}`)
    }
  })

  root.querySelector('#remove-account')!.addEventListener('click', async () => {
    if (!accountId) {
      setStatus('Select an account to remove')
      return
    }
    const removedId = accountId
    const removedPlatform = platformId
    const current = config.platforms[platformId].accounts.find((a) => a.id === accountId)
    if (!(await window.api.confirm(`Remove account “${current?.label ?? ''}” and its saved session?`))) {
      return
    }
    try {
      await window.api.removeAccount(platformId, accountId)
      config = await window.api.getConfig()
      const samePlatform = config.platforms[platformId].accounts[0]
      if (samePlatform) {
        accountId = samePlatform.id
      } else {
        const next = flattenAccounts(config)[0]
        if (next) {
          platformId = next.platformId
          accountId = next.account.id
          addPlatformSelect.value = platformId
        } else {
          accountId = null
        }
      }
      labelInput.value =
        (accountId &&
          config.platforms[platformId].accounts.find((a) => a.id === accountId)?.label) ||
        'Personal'
      setStatus('Account removed')
      render()
      if (accountId) await showAccountUi(platformId, accountId)
      renderSplitChrome()
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
      await showAccountUi(platformId, accountId)
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

  const resizeHandle = root.querySelector('#resize-handle')!
  resizeHandle.addEventListener('pointerdown', (e) => {
    const pe = e as PointerEvent
    pe.preventDefault()
    const startX = pe.clientX
    const startWidth = sidebarWidth
    document.body.style.cursor = 'col-resize'

    const onMove = (ev: PointerEvent) => {
      applySidebarWidth(startWidth + (ev.clientX - startX))
    }
    const onUp = async () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      await window.api.setSidebarWidth(sidebarWidth)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  })

  window.api.onConfigUpdated((next) => {
    config = next
    render()
    renderSplitChrome()
  })

  window.addEventListener('resize', reportBounds)
  applySidebarWidth(config.prefs.sidebarWidth)
  render()
  renderSplitChrome()
  await loadFiles()

  if (accountId) {
    const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
    labelInput.value = selected?.label ?? 'Personal'
    addPlatformSelect.value = platformId
    reportBounds()
    await showAccountUi(platformId, accountId)
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
