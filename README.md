# AI Wrapper

Personal free Mac desktop app: multi-account ChatGPT / Claude / Gemini / OpenAI Platform sessions, plus local workspace read/search and manual file assist.

## Setup (development)

```bash
npm install
npm test
npm run test:smoke
npm run dev
```

`npm run test:smoke` launches the real Electron app and clicks **Add account** to verify the shell works.

## Packaged Mac app (double-click)

```bash
npm install
npm run dist
```

Find the installers in `release/`:

- `AI Wrapper-0.1.0-universal.dmg` — drag to Applications
- `AI Wrapper-0.1.0-universal-mac.zip` — unzip and run `AI Wrapper.app`

**First open on another Mac (unsigned build):** right-click the app → **Open** → confirm. Gatekeeper blocks unsigned apps until you do this once.

Sharing the `.dmg` / `.zip` shares **only the program**. Each person signs into ChatGPT/Claude/etc. with **their own** accounts. Your logins stay on your Mac and are not inside the shared file.

## Usage

1. Use the **top bar** to manage accounts: choose a **Platform**, enter a label, and click **Add** (accounts are listed globally in the sidebar under **All accounts**).
2. Pick an account in the sidebar to open it on its platform, or pick a platform in the left rail to open that platform’s last-used account.
3. Sign in with Google in the webview (popups stay in that account’s session). Add more accounts per platform to switch without mixing cookies.
4. **Add folder** to grant a workspace. Search or browse, then **Copy path**, **Copy contents**, or **Prepare attach** (stages files and opens the folder for the site’s upload UI).

## Manual acceptance checklist

- [ ] Google login works on all four sites
- [ ] Two accounts on one site do not share cookies
- [ ] Switch accounts without relaunch; sessions survive quit/reopen
- [ ] OAuth popup completes in the intended account
- [ ] Copy contents + prepare-attach on ChatGPT and Claude
- [ ] Large/binary files and missing folders behave safely

## Docs

- Design: `docs/superpowers/specs/2026-07-22-ai-wrapper-mac-design.md`
- Plan: `docs/superpowers/plans/2026-07-22-ai-wrapper-mac.md`
