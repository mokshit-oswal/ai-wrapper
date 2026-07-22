import './styles.css'
import { PLATFORMS, platformIds, type PlatformId } from '../shared/platforms'
import type { AppConfig, DirEntry, SearchHit, PaneId } from '../shared/types'

export const SIDEBAR_WIDTH = 320
export const PANE_HEADER_HEIGHT = 40

type PaneSession = { platformId: PlatformId; accountId: string }

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
            <div class="row">
              <button class="action" id="split-toggle" type="button">Split</button>
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
      <div class="main-column">
        <div class="split-headers" id="split-headers" hidden>
          <div class="pane-header" id="pane-header-left" data-pane="left"></div>
          <div class="split-divider" id="split-divider" title="Drag to resize"></div>
          <div class="pane-header" id="pane-header-right" data-pane="right"></div>
        </div>
        <div class="webview-slot" id="webview-slot" aria-hidden="true"></div>
      </div>
      <div class="modal" id="pane-picker-modal" hidden>
        <div class="modal-card">
          <h2>Choose right pane</h2>
          <p class="status">Pick a platform and account to compare.</p>
          <label class="field-label">Platform</label>
          <select id="picker-platform"></select>
          <label class="field-label">Account</label>
          <select id="picker-account"></select>
          <div class="row">
            <button class="action primary" id="picker-confirm" type="button">Open</button>
            <button class="action" id="picker-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `

  let config: AppConfig = await window.api.getConfig()
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
  const splitToggle = root.querySelector('#split-toggle') as HTMLButtonElement
  const splitHeaders = root.querySelector('#split-headers') as HTMLElement
  const pickerModal = root.querySelector('#pane-picker-modal') as HTMLElement
  const pickerPlatform = root.querySelector('#picker-platform') as HTMLSelectElement
  const pickerAccount = root.querySelector('#picker-account') as HTMLSelectElement

  function setStatus(msg: string): void {
    statusEl.textContent = msg
  }

  function reportBounds(): void {
    const height = window.innerHeight
    const width = Math.max(100, window.innerWidth - SIDEBAR_WIDTH)
    const y = splitActive ? PANE_HEADER_HEIGHT : 0
    const contentHeight = Math.max(100, height - y)
    void window.api.setSessionBounds({ x: SIDEBAR_WIDTH, y, width, height: contentHeight })
  }

  function syncSplitHeadersLayout(): void {
    const usable = Math.max(0, 1)
    const leftFr = splitRatio
    const rightFr = usable - splitRatio
    splitHeaders.style.gridTemplateColumns = `minmax(0, ${leftFr}fr) 4px minmax(0, ${rightFr}fr)`
  }

  function paneLabel(session: PaneSession | null): string {
    if (!session) return 'Empty'
    const platform = PLATFORMS[session.platformId].label
    const account = config.platforms[session.platformId].accounts.find(
      (a) => a.id === session.accountId,
    )
    return `${platform} · ${account?.label ?? 'Account'}`
  }

  function renderPaneHeader(pane: PaneId): void {
    const el = root.querySelector(`#pane-header-${pane}`) as HTMLElement
    const session = pane === 'left' ? leftPane : rightPane
    const focused = focusedPane === pane ? 'focused' : ''
    const platformOptions = platformIds()
      .map((id) => {
        const selected = session?.platformId === id ? 'selected' : ''
        return `<option value="${id}" ${selected}>${PLATFORMS[id].label}</option>`
      })
      .join('')
    const accounts = session
      ? config.platforms[session.platformId].accounts
      : config.platforms[platformId].accounts
    const accountOptions =
      accounts.length === 0
        ? `<option value="">No accounts</option>`
        : accounts
            .map((a) => {
              const selected = session?.accountId === a.id ? 'selected' : ''
              return `<option value="${a.id}" ${selected}>${escapeHtml(a.label)}</option>`
            })
            .join('')

    el.className = `pane-header ${focused}`
    el.innerHTML = `
      <div class="pane-title">${escapeHtml(paneLabel(session))}</div>
      <div class="pane-pickers">
        <select data-role="platform">${platformOptions}</select>
        <select data-role="account">${accountOptions}</select>
      </div>
    `

    el.onclick = () => {
      void focusPaneUi(pane)
    }

    const platformSelect = el.querySelector('select[data-role="platform"]') as HTMLSelectElement
    const accountSelect = el.querySelector('select[data-role="account"]') as HTMLSelectElement

    platformSelect.onchange = async (e) => {
      e.stopPropagation()
      const nextPlatform = platformSelect.value as PlatformId
      const first = config.platforms[nextPlatform].accounts[0]
      if (!first) {
        setStatus(`No accounts on ${PLATFORMS[nextPlatform].label}`)
        renderSplitChrome()
        return
      }
      await assignPane(pane, nextPlatform, first.id)
    }

    accountSelect.onchange = async (e) => {
      e.stopPropagation()
      const nextAccount = accountSelect.value
      if (!nextAccount) return
      const pid = (platformSelect.value || session?.platformId || platformId) as PlatformId
      await assignPane(pane, pid, nextAccount)
    }

    platformSelect.onclick = (e) => e.stopPropagation()
    accountSelect.onclick = (e) => e.stopPropagation()
  }

  function renderSplitChrome(): void {
    splitHeaders.hidden = !splitActive
    splitToggle.textContent = splitActive ? 'Exit split' : 'Split'
    if (splitActive) {
      syncSplitHeadersLayout()
      renderPaneHeader('left')
      renderPaneHeader('right')
    }
    reportBounds()
  }

  async function focusPaneUi(pane: PaneId): Promise<void> {
    focusedPane = pane
    await window.api.focusPane(pane)
    if (splitActive) {
      const session = pane === 'left' ? leftPane : rightPane
      if (session) {
        platformId = session.platformId
        accountId = session.accountId
        const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
        labelInput.value = selected?.label ?? 'Personal'
        render()
      }
      renderSplitChrome()
    }
  }

  async function assignPane(
    pane: PaneId,
    nextPlatform: PlatformId,
    nextAccountId: string,
  ): Promise<boolean> {
    const result = await window.api.setPane(pane, nextPlatform, nextAccountId)
    if (!result.ok) {
      setStatus(result.reason)
      renderSplitChrome()
      return false
    }
    const session = { platformId: nextPlatform, accountId: nextAccountId }
    if (pane === 'left') leftPane = session
    else rightPane = session
    focusedPane = pane
    platformId = nextPlatform
    accountId = nextAccountId
    const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
    labelInput.value = selected?.label ?? 'Personal'
    setStatus(`Showing ${paneLabel(session)}`)
    render()
    renderSplitChrome()
    return true
  }

  function fillPickerAccounts(): void {
    const pid = pickerPlatform.value as PlatformId
    const accounts = config.platforms[pid].accounts
    pickerAccount.innerHTML =
      accounts.length === 0
        ? `<option value="">No accounts</option>`
        : accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('')
  }

  function openRightPicker(): void {
    // WebContentsViews paint above HTML — collapse them so the modal is usable
    void window.api.setSessionBounds({ x: SIDEBAR_WIDTH, y: 0, width: 0, height: 0 })
    pickerPlatform.innerHTML = platformIds()
      .map((id) => `<option value="${id}">${PLATFORMS[id].label}</option>`)
      .join('')
    const preferred =
      platformIds().find((id) => id !== leftPane?.platformId) ?? platformId
    pickerPlatform.value = preferred
    fillPickerAccounts()
    pickerModal.hidden = false
  }

  function closeRightPicker(): void {
    pickerModal.hidden = true
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
        accountId = config.platforms[platformId].accounts[0]?.id ?? null
        const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
        labelInput.value = selected?.label ?? 'Personal'
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
          await showAccountUi(platformId, accountId)
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
    const btn = root.querySelector('#add-account') as HTMLButtonElement
    btn.disabled = true
    try {
      const account = await window.api.addAccount(platformId, label)
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
      accountId = config.platforms[platformId].accounts[0]?.id ?? null
      labelInput.value =
        config.platforms[platformId].accounts.find((a) => a.id === accountId)?.label ?? 'Personal'
      if (leftPane?.accountId === removedId && leftPane.platformId === removedPlatform) {
        leftPane = accountId ? { platformId, accountId } : null
      }
      if (rightPane?.accountId === removedId && rightPane.platformId === removedPlatform) {
        rightPane = null
      }
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

  window.api.onConfigUpdated((next: AppConfig) => {
    config = next
    render()
    renderSplitChrome()
  })

  window.addEventListener('resize', reportBounds)
  reportBounds()
  render()
  renderSplitChrome()
  await loadFiles()

  if (accountId) {
    const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
    labelInput.value = selected?.label ?? 'Personal'
    leftPane = { platformId, accountId }
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
