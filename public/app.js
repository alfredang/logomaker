const form = document.getElementById("form");
const descriptionEl = document.getElementById("description");
const generateBtn = document.getElementById("generate");
const placeholder = document.getElementById("placeholder");
const variantsEl = document.getElementById("variants");
const errorEl = document.getElementById("error");
const actions = document.getElementById("actions");
const pickHint = document.getElementById("pick-hint");

const tiles = [...document.querySelectorAll(".variant")];
const arts = tiles.map((t) => t.querySelector(".variant-art"));
const TILES = tiles.length;

let variants = new Array(TILES).fill(null); // final SVG string per tile, or null
let selected = -1;

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

// Close any still-open elements in a partial SVG fragment so it is well-formed XML.
function closeOpenTags(s) {
  const stack = [];
  const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g;
  let m;
  while ((m = tagRe.exec(s))) {
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const idx = stack.lastIndexOf(m[1]);
      if (idx !== -1) stack.length = idx;
    } else if (m[2] && m[3] !== "/") {
      stack.push(m[2]);
    }
  }
  let out = s;
  for (let i = stack.length - 1; i >= 0; i--) out += `</${stack[i]}>`;
  return out;
}

// Build a renderable fragment from a still-streaming SVG: drop a trailing tag cut
// mid-write, close open elements, validate. Returns the fragment or null if invalid.
function safeFragment(acc) {
  const open = acc.search(/<svg[\s>]/i);
  if (open === -1) return null;
  let frag = acc.slice(open);
  const lastGt = frag.lastIndexOf(">");
  if (frag.lastIndexOf("<") > lastGt) frag = frag.slice(0, lastGt + 1);
  frag = closeOpenTags(frag);
  const doc = new DOMParser().parseFromString(frag, "image/svg+xml");
  if (doc.querySelector("parsererror") || !doc.querySelector("svg")) return null;
  return frag;
}

async function generate() {
  const description = descriptionEl.value.trim();
  if (!description) {
    descriptionEl.focus();
    showError("Please describe the logo you want.");
    return;
  }

  setLoading(true);
  resetStage();

  // Per-tile streaming state.
  const accs = new Array(TILES).fill("");
  const lastRender = new Array(TILES).fill(0);
  let settled = 0;
  let succeeded = 0;

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok || !res.body) {
      showError("Something went wrong. Please try again.");
      return;
    }

    const handleFrame = (frame) => {
      const i = frame.i ?? 0;
      if (i < 0 || i >= TILES) return;
      if (frame.type === "delta") {
        accs[i] += frame.text;
        const now = performance.now();
        if (now - lastRender[i] > 120) {
          const frag = safeFragment(accs[i]);
          if (frag) { arts[i].innerHTML = frag; lastRender[i] = now; }
        }
      } else if (frame.type === "done") {
        variants[i] = frame.svg;
        arts[i].innerHTML = frame.svg;
        succeeded++;
        if (selected === -1) setSelected(i); // auto-select the first ready variant
        pickHint.hidden = false;
        if (++settled === TILES) finishLoading();
      } else if (frame.type === "error") {
        tiles[i].classList.add("failed");
        arts[i].innerHTML = '<span style="color:#b3b3b9;font-size:13px">unavailable</span>';
        if (++settled === TILES) finishLoading();
      }
    };

    const finishLoading = () => {
      if (succeeded === 0) showError("Could not generate logos. Please try again.");
    };

    // Read newline-delimited JSON frames as they arrive.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) handleFrame(JSON.parse(line));
      }
    }
  } catch {
    showError("Could not reach the server. Is it running?");
  } finally {
    setLoading(false);
  }
}

function filenameBase() {
  const text = descriptionEl.value.trim().toLowerCase();
  const slug = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "logo";
}

function selectedSvg() {
  return selected >= 0 ? variants[selected] : null;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke: revoking synchronously can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function downloadSvg() {
  const svg = selectedSvg();
  if (!svg) return;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, `${filenameBase()}.svg`);
}

function downloadPng() {
  const svg = selectedSvg();
  if (!svg) return;
  const size = 1024;
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    // White background so the PNG isn't transparent where the SVG has no fill.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, `${filenameBase()}.png`);
    }, "image/png");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showError("Could not render this logo to PNG. The SVG download still works.");
  };
  img.src = url;
}

tiles.forEach((tile, i) => tile.addEventListener("click", () => setSelected(i)));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate();
});

descriptionEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    generate();
  }
});

document.getElementById("download-svg").addEventListener("click", downloadSvg);
document.getElementById("download-png").addEventListener("click", downloadPng);
document.getElementById("regenerate").addEventListener("click", generate);
