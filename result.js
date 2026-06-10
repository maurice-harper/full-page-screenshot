// Result page: load the captured PNG and let the user export it.

const JPEG_QUALITY = 0.92;

let shot = null; // { dataUrl, width, height, clipped, title, url, ts }

// Canvas is built once on first export and reused for JPEG, PDF, and Copy.
let canvasPromise = null;
function getCanvas() {
  if (!canvasPromise) canvasPromise = toCanvas();
  return canvasPromise;
}

init();

async function init() {
  try {
    const data = await chrome.storage.local.get("lastShot");
    shot = data.lastShot;

    if (!shot?.dataUrl) {
      document.getElementById("preview").parentElement.hidden = true;
      document.getElementById("empty").hidden = false;
      return;
    }

    document.getElementById("preview").src = shot.dataUrl;
    document.getElementById("title").textContent = shot.title || "Screenshot";
    const clipNote = shot.clipped ? " — clipped (page exceeded max capture height)" : "";
    document.getElementById("dims").textContent = `${shot.width} × ${shot.height} px${clipNote}`;
    document.title = (shot.title || "Screenshot") + " — capture";

    document.getElementById("png").addEventListener("click", savePng);
    document.getElementById("jpeg").addEventListener("click", saveJpeg);
    document.getElementById("pdf").addEventListener("click", savePdf);
    document.getElementById("copy").addEventListener("click", copyImage);
  } catch (err) {
    console.error("Failed to load screenshot:", err);
    document.getElementById("preview").parentElement.hidden = true;
    document.getElementById("empty").textContent = "Failed to load screenshot. Try capturing again.";
    document.getElementById("empty").hidden = false;
  }
}

// Helpers --------------------------------------------------------------------

function baseName(ext) {
  const t = (shot.title || "screenshot")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "screenshot";
  const d = new Date(shot.ts || Date.now());
  const stamp = d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${t}-${stamp}.${ext}`;
}

function download(blobOrUrl, filename) {
  const url = blobOrUrl instanceof Blob ? URL.createObjectURL(blobOrUrl) : blobOrUrl;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (blobOrUrl instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function loadImage() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = shot.dataUrl;
  });
}

async function toCanvas() {
  const img = await loadImage();
  const canvas = document.createElement("canvas");
  canvas.width = shot.width;
  canvas.height = shot.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// Exports --------------------------------------------------------------------

function savePng() {
  download(shot.dataUrl, baseName("png"));
  toast("Saved PNG");
}

async function saveJpeg() {
  const canvas = await getCanvas();
  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  download(blob, baseName("jpg"));
  toast("Saved JPEG");
}

async function savePdf() {
  const canvas = await getCanvas();
  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = buildPdf(jpeg, shot.width, shot.height);
  download(new Blob([pdf], { type: "application/pdf" }), baseName("pdf"));
  toast("Saved PDF");
}

async function copyImage() {
  try {
    const canvas = await getCanvas();
    const blob = await canvasToBlob(canvas, "image/png");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Copied to clipboard");
  } catch (e) {
    console.error(e);
    toast("Copy failed — click the page first, then retry");
  }
}

// Minimal single-image PDF (embeds the JPEG directly via DCTDecode) ----------

function buildPdf(jpeg, w, h) {
  const enc = new TextEncoder();
  const parts = [];
  let len = 0;
  const offsets = [];

  const push = (x) => {
    const b = typeof x === "string" ? enc.encode(x) : x;
    parts.push(b);
    len += b.length;
  };
  const obj = (n, body) => {
    offsets[n] = len;
    push(n + " 0 obj\n");
    (Array.isArray(body) ? body : [body]).forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  obj(4, [
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
      `/Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  ]);
  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}endstream`);

  const xrefStart = len;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
