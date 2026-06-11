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
  arts.forEach((a) => (a.innerHTML = ""));
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
    `Flat vector-style design, simple shapes, a small cohesive color palette, strong contrast, ` +
    `centered on a plain solid background, no extra text or watermark. Make it distinct from other variations.`
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
    body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024" }),
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
        .then((src) => {
          variants[i] = src;
          arts[i].innerHTML = `<img alt="logo variation ${i + 1}" src="${src}">`;
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
