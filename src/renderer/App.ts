import './styles.css'
import {
  flattenAccounts,
  formatAccountLabel,
  resolveAccountForPlatform,
} from '../shared/accounts-view'
import { clampSidebarWidth, sessionContentBounds } from '../shared/layout'
import { PLATFORMS, platformIds, type PlatformId } from '../shared/platforms'
import type { AppConfig, ThemeMode } from '../shared/types'

export async function mountApp(root: HTMLElement): Promise<void> {
  if (!window.api) {
    root.innerHTML = `<p style="padding:16px;color:var(--color-danger, #b42318)">Shell API failed to load (preload). Restart the app.</p>`
    throw new Error('window.api is missing — preload did not load')
  }

  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="rail-brand">AI Wrapper</div>
        <section class="rail-section platforms">
          <h2 class="section-title">Platforms</h2>
          <div id="platform-list"></div>
        </section>
        <section class="rail-section accounts">
          <div class="rail-section-head">
            <h2 class="section-title">Accounts</h2>
            <details class="manage" id="account-manage">
              <summary class="manage-toggle">Manage</summary>
              <div class="manage-menu">
                <button class="action" id="rename-account" type="button">Rename</button>
                <button class="action danger" id="remove-account" type="button">Remove</button>
                <button class="action danger" id="clear-session" type="button">Clear session</button>
              </div>
            </details>
          </div>
          <div id="account-list"></div>
        </section>
        <div class="rail-footer">
          <button class="theme-toggle" id="theme-toggle" type="button" aria-pressed="false">
            Dark mode
          </button>
        </div>
      </aside>
      <div class="resize-handle" id="resize-handle" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <div class="main-column">
        <header class="topbar" id="topbar">
          <div class="topbar-title">Session</div>
          <div class="topbar-add">
            <select id="add-platform" aria-label="Platform for new account"></select>
            <input type="text" id="account-label" placeholder="Label" value="Personal" />
            <button class="action primary" id="add-account" type="button">Add</button>
          </div>
          <p class="status" id="status">Ready</p>
        </header>
        <div class="stage-frame">
          <div class="webview-slot" id="webview-slot" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  `

  let config: AppConfig = await window.api.getConfig()
  let sidebarWidth = clampSidebarWidth(config.prefs.sidebarWidth)
  let platformId: PlatformId = config.prefs.lastPlatform
  let accountId: string | null = config.prefs.lastAccountId
  let themeMode: ThemeMode = config.prefs.themeMode

  const statusEl = root.querySelector('#status') as HTMLElement
  const labelInput = root.querySelector('#account-label') as HTMLInputElement
  const addPlatformSelect = root.querySelector('#add-platform') as HTMLSelectElement
  const themeToggle = root.querySelector('#theme-toggle') as HTMLButtonElement

  function applyTheme(mode: ThemeMode): void {
    themeMode = mode
    document.documentElement.dataset.theme = mode
    const dark = mode === 'dark'
    themeToggle.setAttribute('aria-pressed', dark ? 'true' : 'false')
    themeToggle.textContent = dark ? 'Light mode' : 'Dark mode'
  }

  applyTheme(themeMode)

  addPlatformSelect.innerHTML = platformIds()
    .map((id) => `<option value="${id}">${PLATFORMS[id].label}</option>`)
    .join('')
  addPlatformSelect.value = platformId

  function setStatus(msg: string): void {
    statusEl.textContent = msg
  }

  function reportBounds(): void {
    void window.api.setSessionBounds(
      sessionContentBounds(window.innerWidth, window.innerHeight, sidebarWidth),
    )
  }

  function applySidebarWidth(px: number): void {
    sidebarWidth = clampSidebarWidth(px)
    root.style.setProperty('--sidebar', `${sidebarWidth}px`)
    reportBounds()
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
        if (accountId) void window.api.showAccount(platformId, accountId)
      })
    })
  }

  function renderAccounts(): void {
    const list = root.querySelector('#account-list')!
    const flat = flattenAccounts(config)
    if (flat.length === 0) {
      list.innerHTML = `<p class="status">No accounts yet. Pick a platform, set a label, and Add.</p>`
      return
    }
    list.innerHTML = flat
      .map(({ platformId: pid, account: a }) => {
        const active = a.id === accountId && pid === platformId ? 'active' : ''
        const text = formatAccountLabel(pid, a.label)
        const badge =
          active === 'active' ? `<span class="badge badge-active">Active</span>` : ''
        return `<button type="button" class="account-btn ${active}" data-id="${a.id}" data-platform="${pid}"><span>${escapeHtml(text)}</span> ${badge}</button>`
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

  function render(): void {
    renderPlatforms()
    renderAccounts()
  }

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
      await window.api.showAccount(platformId, account.id)
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
      setStatus('Enter a label in the top bar first')
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

  themeToggle.addEventListener('click', async () => {
    const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try {
      const saved = await window.api.setThemeMode(next)
      applyTheme(saved)
      setStatus(saved === 'dark' ? 'Dark mode' : 'Light mode')
    } catch (err) {
      // Theme already applied locally; persistence needs a main-process restart after upgrades.
      console.warn('Theme preference not saved:', err)
      setStatus(next === 'dark' ? 'Dark mode (not saved — restart app)' : 'Light mode (not saved — restart app)')
    }
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

  window.api.onConfigUpdated((next: AppConfig) => {
    config = next
    applyTheme(next.prefs.themeMode)
    render()
  })

  window.addEventListener('resize', reportBounds)
  applySidebarWidth(config.prefs.sidebarWidth)
  render()

  if (accountId) {
    const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
    labelInput.value = selected?.label ?? 'Personal'
    addPlatformSelect.value = platformId
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
