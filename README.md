# Full Page Screenshot

A tiny, free, no-account Chrome/Brave extension that captures the **entire scrollable page** in one shot, then lets you export it as **PNG, JPEG, PDF, or copy to clipboard**. Nothing leaves your machine.

## How it works

It uses the Chrome DevTools Protocol (`Page.captureScreenshot` with `captureBeyondViewport`) to grab the full page in a single pass — no scroll-and-stitch glitches. While capturing, the browser briefly shows a "started debugging this browser" banner; that's expected and goes away as soon as the shot completes.

## Install (unpacked)

1. Open `chrome://extensions` (or `brave://extensions`).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension from the puzzle-piece menu if you want it always visible.

## Use

- Click the toolbar icon, **or** press **Alt+Shift+S**.
- A result tab opens with a preview and four buttons: **Save PNG**, **Save JPEG**, **Save PDF**, **Copy**.

To change the shortcut, go to `chrome://extensions/shortcuts`.

## Notes & limits

- Can't capture browser-internal pages (`chrome://`, `brave://`, the Web Store, etc.) — the toolbar badge flashes red if you try.
- Extremely tall pages may hit the browser's internal maximum image height; most normal pages are fine.
- The PDF is a single page sized to the screenshot's pixel dimensions, with the JPEG embedded directly (no external libraries).

## Files

- `manifest.json` — MV3 config, permissions, toolbar action, keyboard command.
- `background.js` — capture logic (attach debugger → capture → store → open result).
- `result.html` / `result.js` — preview and export (PNG / JPEG / PDF / clipboard).
- `icons/` — toolbar icons.
