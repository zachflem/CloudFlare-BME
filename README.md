# Cloudflare Build Monitor

A dead simple browser extension for watching Cloudflare Pages builds.

Push to GitHub, click watch, and get:
- spinning icon while builds are running
- green tick on success
- red cross on failure

No dashboards.  
No tabs sitting open.  
No bullshit.

## Features

- Monitors all Pages projects in your Cloudflare account
- Manual "watch mode"
- Auto sleeps after inactivity
- Adjustable inactivity timeout
- Quick links to builds and deployed sites
- Tiny lightweight popup UI
- Works in Chrome, Brave, Edge and other Chromium browsers

## Installation

1. Download or clone the repo
2. Open:
   - `chrome://extensions`
   - `brave://extensions`
   - `edge://extensions`
3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the extension folder

## Cloudflare API Token

Create a read-only API token with:
- `Account > Cloudflare Pages > Read`

Then enter:
- Account ID
- API Token

into the extension settings.

## Why?

Because opening the Cloudflare dashboard 400 times a day gets old fast.

## Website

https://seezed.net/tools#cloudflare-build-monitor
