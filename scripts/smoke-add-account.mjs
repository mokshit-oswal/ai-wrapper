/**
 * Electron smoke test: launches the app, clicks Add account, asserts account appears.
 * Run: npm run test:smoke
 */
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-wrapper-smoke-'))
  const electronPath = require('electron')

  execSync('npx electron-vite build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  })

  const app = await electron.launch({
    executablePath: electronPath,
    args: [path.join(root, 'out/main/index.js')],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      AI_WRAPPER_USER_DATA: userData,
    },
    timeout: 60_000,
  })

  try {
    const page = await app.firstWindow({ timeout: 60_000 })
    await page.waitForSelector('#add-account', { timeout: 30_000 })

    const hasApi = await page.evaluate(
      () => typeof window.api?.addAccount === 'function',
    )
    if (!hasApi) {
      throw new Error('window.api.addAccount missing — preload failed')
    }

    await page.selectOption('#add-platform', 'chatgpt')
    await page.fill('#account-label', 'Smoke Test')
    await page.click('#add-account')

    await page.waitForFunction(
      () => document.querySelector('#account-list')?.textContent?.includes('Smoke Test'),
      null,
      { timeout: 15_000 },
    )

    const status = await page.locator('#status').innerText()
    console.log('STATUS=' + status)
    console.log('SMOKE_OK add-account works')
  } finally {
    await app.close()
    fs.rmSync(userData, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('SMOKE_FAIL', err)
  process.exit(1)
})
