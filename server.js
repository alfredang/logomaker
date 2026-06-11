import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const PORT = process.env.PORT || 3000;
// Model alias: 'sonnet' is fast and capable for SVG generation. Override with LOGO_MODEL.
const MODEL = process.env.LOGO_MODEL || "sonnet";
const VARIANTS = 3; // number of logo options generated per request

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

const SYSTEM_PROMPT = `You are an expert vector logo designer. You output clean, minimalist, modern SVG logos.

OUTPUT — follow exactly:
- Respond with ONE self-contained <svg>...</svg> element and NOTHING else. No prose, no markdown, no code fences, no explanation.
- Use viewBox="0 0 512 512". Do not set absolute width/height in pixels (keep it scalable).
- Self-contained only: no external fonts, no <image>, no external URLs, no <script>. Inline everything.
- The result must be valid SVG that renders on its own.

DESIGN — aim for a logo a brand would actually use:
- One clear idea. Build the mark from simple geometric shapes (circle, rect, path, polygon) with confident negative space.
- Compose on an implied grid: center the mark, keep ~12% padding from the edges, and balance visual weight.
- Use a small cohesive palette (1–3 colors) with strong contrast; honor any colors the user names. Default to a refined, modern look, not clip-art.
- Keep strokes consistent (uniform stroke-width, round joins/caps where it suits the style).
- Avoid tiny illegible text and busy detail. If text is requested, keep it to a short word in a generic font-family, sized to read clearly.`;

// Light per-variant nudges so the three results read as distinct directions.
const VARIANT_HINTS = [
  "Favor a clean, geometric, minimal treatment.",
  "Explore a bolder, more distinctive silhouette or composition.",
  "Try a different arrangement, framing, or negative-space idea.",
];

function buildPrompt(description, variant = 0) {
  const hint = VARIANT_HINTS[variant] || "";
  return `Design a minimalist logo for this description:\n\n"${description}"\n\nThis is design variation ${variant + 1} of 3. ${hint} Make it visually distinct from the other variations.\n\nReturn only the SVG.`;
}

// Extract the first complete <svg>...</svg> block from arbitrary model text.
function extractSvg(text) {
  if (!text) return null;
  const match = text.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0].trim() : null;
}

// Stream the logo generation. `onDelta(text)` is called with each text chunk as it
// arrives so the caller can show progress. Resolves to the final, validated SVG.
async function generateLogo(description, onDelta, variant = 0) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 120_000);

  let resultText = "";
  let assistantText = "";

  try {
    for await (const message of query({
      prompt: buildPrompt(description, variant),
      options: {
        systemPrompt: SYSTEM_PROMPT,
        model: MODEL,
        tools: [], // pure text generation — no filesystem/bash tools
        maxTurns: 1,
        thinking: { type: "disabled" }, // a logo needs no extended reasoning — cuts latency
        includePartialMessages: true, // emit token deltas so we can stream progress
        settingSources: [], // don't load project CLAUDE.md / settings
        abortController: abort,
      },
    })) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
          assistantText += event.delta.text;
          onDelta?.(event.delta.text);
        }
      } else if (message.type === "assistant") {
        // Fallback when partial streaming is unavailable: capture the full assistant text.
        if (!assistantText) {
          for (const block of message.message.content ?? []) {
            if (block.type === "text") assistantText += block.text;
          }
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          resultText = message.result || "";
        } else {
          const detail = message.errors?.join("; ") || message.subtype;
          throw new Error(`Generation failed: ${detail}`);
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const svg = extractSvg(resultText) || extractSvg(assistantText);
  if (!svg) {
    throw new Error("The model did not return a valid SVG. Try rephrasing your description.");
  }
  return svg;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": MIME[".json"] });
  res.end(body);
}

async function serveStatic(req, res) {
  // Map "/" -> index.html; prevent path traversal outside PUBLIC_DIR.
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = normalize(join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/generate") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) req.destroy(); // guard against oversized bodies
    });
    req.on("end", async () => {
      let description;
      try {
        description = String(JSON.parse(raw).description || "").trim();
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON body." });
      }
      if (!description) {
        return sendJson(res, 400, { error: "Please describe the logo you want." });
      }
      if (description.length > 2000) {
        return sendJson(res, 400, { error: "Description is too long (max 2000 characters)." });
      }

      // Stream NDJSON frames, each tagged with its variant index `i`:
      //   {type:"delta",i,text} … {type:"done",i,svg} | {type:"error",i,error}
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache",
      });
      const write = (obj) => res.write(JSON.stringify(obj) + "\n");

      // Generate the three variations in parallel; their frames interleave by index.
      await Promise.all(
        Array.from({ length: VARIANTS }, (_, i) =>
          generateLogo(description, (text) => write({ type: "delta", i, text }), i)
            .then((svg) => write({ type: "done", i, svg }))
            .catch((err) => {
              console.error(`variant ${i} error:`, err);
              const message = err?.name === "AbortError"
                ? "Generation timed out."
                : err?.message || "Generation failed.";
              write({ type: "error", i, error: message });
            })
        )
      );
      res.end();
    });
    return;
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`\n  Logo Maker running → http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL} (set LOGO_MODEL to change)\n`);
});
