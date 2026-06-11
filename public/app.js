// ---- Elements ----
const form = document.getElementById("form");
const descriptionEl = document.getElementById("description");
const generateBtn = document.getElementById("generate");
const providerEl = document.getElementById("provider");
const keyInput = document.getElementById("api-key");
const themeToggle = document.getElementById("theme-toggle");
const placeholder = document.getElementById("placeholder");
const variantsEl = document.getElementById("variants");
const errorEl = document.getElementById("error");
const actions = document.getElementById("actions");
const pickHint = document.getElementById("pick-hint");

const tiles = [...document.querySelectorAll(".variant")];
const arts = tiles.map((t) => t.querySelector(".variant-art"));
const TILES = tiles.length;

// ---- Provider config ----
// Gemini "nano banana" image model. Change GEMINI_MODEL if Google renames it.
const GEMINI_MODEL = "gemini-2.5-flash-image";
const PROVIDERS = {
  gemini: { keyStore: "logomaker_key_gemini", placeholder: "Paste your Google AI Studio key (AIza…)" },
  openai: { keyStore: "logomaker_key_openai", placeholder: "Paste your OpenAI key (sk-…)" },
};

let variants = new Array(TILES).fill(null); // final data-URL per tile, or null
let selected = -1;

// ---- Theme ----
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("logomaker_theme", theme);
}
applyTheme(
  localStorage.getItem("logomaker_theme") ||
  (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
);
themeToggle.addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")
);

// ---- API key + provider persistence ----
function syncKeyField() {
  const p = PROVIDERS[providerEl.value];
  keyInput.placeholder = p.placeholder;
  keyInput.value = localStorage.getItem(p.keyStore) || "";
}
providerEl.value = localStorage.getItem("logomaker_provider") || "gemini";
providerEl.addEventListener("change", () => {
  localStorage.setItem("logomaker_provider", providerEl.value);
  syncKeyField();
});
keyInput.addEventListener("input", () => {
  localStorage.setItem(PROVIDERS[providerEl.value].keyStore, keyInput.value.trim());
});
syncKeyField();

// ---- UI helpers ----
function setLoading(loading) {
  generateBtn.disabled = loading;
  generateBtn.classList.toggle("loading", loading);
  generateBtn.querySelector(".btn-label").textContent = loading ? "Generating" : "Generate";
  variantsEl.classList.toggle("loading", loading);
}

function showError(message) {
  variantsEl.hidden = true;
  placeholder.hidden = true;
  errorEl.textContent = message;
  errorEl.hidden = false;
  actions.hidden = true;
  pickHint.hidden = true;
}

function resetStage() {
  variants = new Array(TILES).fill(null);
  selected = -1;
  errorEl.hidden = true;
  placeholder.hidden = true;
  actions.hidden = true;
  pickHint.hidden = true;
  variantsEl.hidden = false;
  tiles.forEach((t) => t.classList.remove("selected", "failed"));
  arts.forEach((a) => { a.innerHTML = ""; a.classList.remove("has-image"); });
}

function setSelected(i) {
  if (!variants[i]) return;
  selected = i;
  tiles.forEach((t, k) => t.classList.toggle("selected", k === i));
  actions.hidden = false;
}

// ---- Prompt ----
const VARIANT_HINTS = [
  "Clean, geometric, minimal treatment.",
  "A bolder, more distinctive silhouette or composition.",
  "A different arrangement, framing, or use of negative space.",
];
function buildPrompt(description, variant) {
  return (
    `A minimalist, modern brand logo of: ${description}. ` +
    `${VARIANT_HINTS[variant] || ""} ` +
    `Flat vector-style design, simple shapes, a small cohesive color palette, strong contrast. ` +
    `The logo must be fully isolated and centered on a plain pure-white (#FFFFFF) background with ` +
    `generous empty margin around it, no drop shadow, no scene or photo background, no extra text or watermark. ` +
    `Make it distinct from other variations.`
  );
}

// ---- Image providers (called directly from the browser with the user's key) ----
async function errorMessage(res) {
  let detail = "";
  try {
    const data = await res.json();
    detail = data?.error?.message || data?.error?.code || JSON.stringify(data?.error || data);
  } catch {
    detail = `${res.status} ${res.statusText}`;
  }
  return detail;
}

async function generateGemini(prompt, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error("No image was returned. Try a different prompt.");
  return `data:${img.inlineData.mimeType || "image/png"};base64,${img.inlineData.data}`;
}

async function generateOpenAI(prompt, key) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      background: "transparent",
      output_format: "png",
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (b64) return `data:image/png;base64,${b64}`;
  if (url) return url;
  throw new Error("No image was returned. Try a different prompt.");
}

function generateOne(prompt, provider, key) {
  return provider === "openai" ? generateOpenAI(prompt, key) : generateGemini(prompt, key);
}

// ---- Image post-processing: transparent background + crop to the logo ----
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Flood-fill from the borders, turning the (roughly uniform) background transparent.
// Interior pixels of the same color are preserved because they aren't connected to an edge.
function removeBackground(data, width, height) {
  const idx = (x, y) => (y * width + x) * 4;
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)];
  // Already transparent (e.g. OpenAI native transparent background)? Leave it.
  if (corners.every((i) => data[i + 3] < 16)) return;

  let r = 0, g = 0, b = 0;
  for (const i of corners) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  r /= 4; g /= 4; b /= 4;

  const TOL_IN = 45, TOL_OUT = 95;
  const inTol2 = TOL_IN * TOL_IN, outTol2 = TOL_OUT * TOL_OUT;
  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, 0, x, height - 1);
  for (let y = 0; y < height; y++) stack.push(0, y, width - 1, y);

  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    const dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 > outTol2) continue; // logo boundary — keep pixel, stop flooding
    if (dist2 <= inTol2) {
      data[i + 3] = 0;
    } else {
      const t = (Math.sqrt(dist2) - TOL_IN) / (TOL_OUT - TOL_IN); // soft edge
      data[i + 3] = Math.min(data[i + 3], Math.round(255 * t));
    }
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

// Bounding box of pixels with meaningful opacity.
function opaqueBounds(data, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

// Make the background transparent and crop tightly to the logo (with a small margin).
async function processImage(src) {
  const img = await loadImage(src);
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  removeBackground(imageData.data, w, h);
  ctx.putImageData(imageData, 0, 0);

  const box = opaqueBounds(imageData.data, w, h);
  if (!box) return c.toDataURL("image/png"); // nothing to crop to

  const bw = box.maxX - box.minX + 1;
  const bh = box.maxY - box.minY + 1;
  const pad = Math.max(4, Math.round(Math.max(bw, bh) * 0.04)); // small breathing room
  const out = document.createElement("canvas");
  out.width = bw + pad * 2;
  out.height = bh + pad * 2;
  out.getContext("2d").drawImage(c, box.minX, box.minY, bw, bh, pad, pad, bw, bh);
  return out.toDataURL("image/png");
}

// ---- Generate (3 variations in parallel) ----
async function generate() {
  const description = descriptionEl.value.trim();
  if (!description) {
    descriptionEl.focus();
    showError("Please describe the logo you want.");
    return;
  }
  const provider = providerEl.value;
  const key = (keyInput.value || "").trim();
  if (!key) {
    keyInput.focus();
    showError(`Add your ${provider === "openai" ? "OpenAI" : "Gemini"} API key above to generate.`);
    return;
  }

  setLoading(true);
  resetStage();
  let succeeded = 0;

  await Promise.all(
    Array.from({ length: TILES }, (_, i) =>
      generateOne(buildPrompt(description, i), provider, key)
        .then(async (src) => {
          // Transparent background + crop to the logo (falls back to raw image on failure).
          const out = await processImage(src).catch(() => src);
          variants[i] = out;
          arts[i].innerHTML = `<img alt="logo variation ${i + 1}" src="${out}">`;
          arts[i].classList.add("has-image");
          succeeded++;
          if (selected === -1) setSelected(i); // auto-select the first ready variant
          pickHint.hidden = false;
        })
        .catch((err) => {
          tiles[i].classList.add("failed");
          arts[i].innerHTML = `<span class="msg">unavailable</span>`;
          arts[i].dataset.error = err?.message || "failed";
        })
    )
  );

  setLoading(false);
  if (succeeded === 0) {
    const sample = arts.map((a) => a.dataset.error).find(Boolean) || "Please try again.";
    showError(`Could not generate logos. ${sample}`);
  }
}

// ---- Download (selected variant, as PNG) ----
function filenameBase() {
  const text = descriptionEl.value.trim().toLowerCase();
  const slug = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "logo";
}

function triggerDownload(href, filename, revoke) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

async function downloadPng() {
  if (selected < 0 || !variants[selected]) return;
  const src = variants[selected];
  try {
    // Data URLs download directly; remote URLs are fetched into a blob first.
    if (src.startsWith("data:")) {
      triggerDownload(src, `${filenameBase()}.png`, false);
    } else {
      const blob = await (await fetch(src)).blob();
      triggerDownload(URL.createObjectURL(blob), `${filenameBase()}.png`, true);
    }
  } catch {
    showError("Could not download the image. Try right-click → Save image.");
  }
}

// ---- Wire up ----
tiles.forEach((tile, i) => tile.addEventListener("click", () => setSelected(i)));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate();
});

document.getElementById("download-png").addEventListener("click", downloadPng);
document.getElementById("regenerate").addEventListener("click", generate);
