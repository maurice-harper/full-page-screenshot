// Full Page Screenshot — background service worker
// Captures the entire scrollable page using the Chrome DevTools Protocol
// (Page.captureScreenshot with captureBeyondViewport), then opens a result
// page where the user picks an export format.

const PROTOCOL_VERSION = "1.3";
const MAX_CAPTURE_DIMENSION = 16384; // Chrome canvas hard limit

let capturing = false;

// Promisified chrome.debugger helpers ----------------------------------------

function attach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, PROTOCOL_VERSION, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function detach(target) {
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => {
      // Ignore errors on detach (target may already be gone).
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function send(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

// Core capture ---------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function measure(metrics) {
  // cssContentSize is the modern field; fall back to contentSize.
  const content = metrics.cssContentSize || metrics.contentSize;
  return { width: Math.ceil(content.width), height: Math.ceil(content.height) };
}

async function captureFullPage(tab) {
  const target = { tabId: tab.id };
  await attach(target);
  let overrode = false;
  try {
    await send(target, "Page.enable");

    // First pass: read the page's real content size.
    let size = measure(await send(target, "Page.getLayoutMetrics"));

    // Resize the *emulated* viewport to the full content height. This forces
    // the page to actually lay out at full size, so captureBeyondViewport
    // paints real content instead of tiling the visible viewport.
    await send(target, "Emulation.setDeviceMetricsOverride", {
      width: Math.min(size.width, MAX_CAPTURE_DIMENSION),
      height: Math.min(size.height, MAX_CAPTURE_DIMENSION),
      deviceScaleFactor: 1,
      mobile: false,
    });
    overrode = true;

    // Let the page reflow / lazy-loaded content settle, then re-measure
    // (height can grow once the layout expands to fill the new viewport).
    await sleep(350);
    size = measure(await send(target, "Page.getLayoutMetrics"));

    const rawWidth = size.width;
    const rawHeight = size.height;
    const width = Math.min(rawWidth, MAX_CAPTURE_DIMENSION);
    const height = Math.min(rawHeight, MAX_CAPTURE_DIMENSION);
    const clipped = rawWidth > MAX_CAPTURE_DIMENSION || rawHeight > MAX_CAPTURE_DIMENSION;

    // Re-apply the override with the post-reflow size so the viewport matches
    // the clip exactly. Without this, if the page grew during reflow,
    // captureBeyondViewport would still tile the overflow and repeat fixed
    // elements (navbars, sidebars) once per viewport-height chunk.
    await send(target, "Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const { data } = await send(target, "Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });

    return { dataUrl: "data:image/png;base64," + data, width, height, clipped };
  } finally {
    if (overrode) {
      try {
        await send(target, "Emulation.clearDeviceMetricsOverride");
      } catch (_) {}
    }
    await detach(target);
  }
}

// Orchestration --------------------------------------------------------------

async function run(tab) {
  if (capturing) return;
  if (!tab || !tab.id) return;

  // Pages we cannot attach the debugger to.
  const url = tab.url || "";
  if (/^(chrome|edge|brave|about|chrome-extension|devtools|view-source|file|blob|data):/.test(url)) {
    await flashBadge("no", "#c0392b");
    return;
  }

  capturing = true;
  try {
    await flashBadge("...", "#2d7ef7");
    const shot = await captureFullPage(tab);

    await chrome.storage.local.set({
      lastShot: {
        dataUrl: shot.dataUrl,
        width: shot.width,
        height: shot.height,
        clipped: shot.clipped,
        title: tab.title || "screenshot",
        url: url,
        ts: Date.now(),
      },
    });

    await chrome.tabs.create({ url: chrome.runtime.getURL("result.html") });
    // Clear badge immediately — we're still in the active service worker context.
    chrome.action.setBadgeText({ text: "" });
  } catch (err) {
    console.error("Capture failed:", err);
    await flashBadge("err", "#c0392b");
  } finally {
    capturing = false;
  }
}

// Small toolbar badge feedback -----------------------------------------------

async function flashBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
  } catch (_) {}
}

// Triggers -------------------------------------------------------------------

chrome.action.onClicked.addListener((tab) => run(tab));

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-full-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  run(tab);
});
