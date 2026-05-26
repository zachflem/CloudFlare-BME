# Cloudflare Build Monitor v1.7


A simple Manifest V3 browser extension that manually watches your Cloudflare Pages projects every 30 seconds, shows a build/status icon in the browser toolbar, and goes back to sleep after a configurable inactivity timeout.

## What it does

- Click **Start watching** when you push code.
- Polls Cloudflare every 30 seconds.
- Shows a toolbar icon:
  - grey = sleeping/idle
  - orange spinner-style icon = checking/building
  - green tick = latest result succeeded
  - red cross = latest result failed or API error
- Shows a badge count while builds are active.
- Sleeps after 5-60 minutes without detecting an active build.
- Timeout resets every time an active build is detected.

## Current scope

This version monitors **Cloudflare Pages deployments** using the Cloudflare API:

- `GET /accounts/{account_id}/pages/projects`
- `GET /accounts/{account_id}/pages/projects/{project_name}/deployments`

Cloudflare documents the Pages project/deployment API and deployment status fields in its API docs.

Workers Builds monitoring can be added later if you want the same behaviour for non-Pages Workers build pipelines.

## Permissions

The extension asks for:

- `storage` — stores your Account ID, API token, timeout value, and last status.
- `alarms` — runs the 30-second polling loop.
- `https://api.cloudflare.com/*` — calls the Cloudflare API.

## Cloudflare setup

1. Open the Cloudflare dashboard.
2. Find your **Account ID**.
   - A common place to see it is in URLs like:
     `https://dash.cloudflare.com/<ACCOUNT_ID>/pages`
3. Create a Cloudflare API token.
4. Use the narrowest permissions practical.
   - For Pages monitoring, start with **Account → Cloudflare Pages → Read**.
   - If Cloudflare rejects the request, expand only as much as needed.

Do not share this extension folder with your API token saved inside your browser profile.

## Install locally in Chrome / Brave / Edge

1. Unzip this package somewhere permanent, for example:
   - `~/Apps/cloudflare-build-monitor`
   - `C:\Tools\cloudflare-build-monitor`
2. Open your Chromium browser.
3. Go to:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the `cloudflare-build-monitor` folder.
7. Pin the extension to your toolbar.

## Usage

1. Click the extension icon.
2. Enter your Cloudflare **Account ID**.
3. Enter your Cloudflare **API token**.
4. Click **Save settings**.
5. Set the inactivity slider between **5 and 60 minutes**.
6. Click **Start watching**.

When you push a build:

- The extension checks every 30 seconds.
- It stays active while builds are detected.
- It sleeps after your selected timeout once no active builds have been seen.

## Notes

- This is intentionally manual. It does not run forever in the background.
- The API token is stored in browser extension local storage. For personal use this is usually acceptable, but a more secure production-grade version would use a tiny proxy service or Cloudflare Worker so the token never lives in the browser extension.
- Browser extension service workers sleep by design. This extension uses `chrome.alarms`, which is the right pattern for Manifest V3 scheduled polling.

## v1.2 note

This version removes `page` and `per_page` query parameters from the Cloudflare Pages project/deployment list calls. Some Cloudflare Pages endpoints reject those parameters with:

`Invalid list options provided. Review the page or per_page parameter.`


## v1.5 troubleshooting note

This build bumps the extension manifest version and logs the exact Cloudflare API URL in DevTools. It sends no `page` or `per_page` parameters to the Pages project list or deployment list endpoints.

If Chrome still shows `fetchJson` around line 265, the old extension is still loaded. Remove the extension completely, then load the v1.5 folder unpacked. In v1.5, `fetchJson` is around line 237.


## v1.5

Project rows now include an **Open build** link to the matching Cloudflare Pages deployment in the Cloudflare dashboard, plus an **Open site** link when Cloudflare returns a deployment URL.


## v1.5 update

- Account settings are now collapsible and auto-collapse after credentials are saved.
- Polling timeout settings are now collapsible, with the selected timeout still visible in the summary row.


## v1.6

- Tightened collapsed Account settings and Polling settings sections to give more room to the build list.


## v1.7

- Merged Account settings and Polling settings into one compact Settings panel.
