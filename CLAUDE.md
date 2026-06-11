# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: Logo Maker

A modern, minimalist web tool: the user describes a logo in plain words and the app
generates **three** clean vector logo options to pick from, downloadable as **SVG** or
**PNG**. Logos are produced by Claude via the **Claude Agent SDK** using the developer's
**Claude subscription** (no API key).

## Architecture

- **Frontend** (`public/`) — pure HTML/CSS/JavaScript, no frameworks, no build step.
  - `index.html` — single-column minimalist UI: description textarea, Generate button,
    square preview stage, and SVG/PNG/Regenerate actions.
  - `style.css` — neutral palette, system font stack, generous whitespace, responsive.
    Note: `[hidden] { display: none !important; }` is required because `.placeholder`,
    `.preview`, and `.actions` set an explicit `display`, which otherwise overrides the
    `hidden` attribute.
  - `app.js` — vanilla JS: POSTs to `/api/generate`, reads the streamed response, and
    renders **three variant tiles progressively as they generate** ("watch them draw").
    The user clicks a tile to select it (first to finish is auto-selected); the selected
    variant is what the download buttons export. Then handles downloads. PNG is rendered client-side by drawing the SVG onto a 1024×1024 `<canvas>`
    (with a white background) and calling `canvas.toBlob`. `renderPartial` +
    `closeOpenTags` make a still-streaming SVG well-formed (drop the half-written trailing
    tag, close open elements) and validate via `DOMParser` before injecting — bad frames
    are skipped, so worst case the logo just appears at the end.
- **Backend** (`server.js`) — a tiny Node `http` server (no Express). Serves `public/`
  and exposes `POST /api/generate`, which runs `VARIANTS` (3) `query()` calls **in
  parallel** and **streams newline-delimited JSON (NDJSON)** frames tagged by variant
  index `i`: `{type:"delta",i,text}` … `{type:"done",i,svg}` (or `{type:"error",i,error}`).
  Each variant gets a light per-variant prompt nudge so the three read as distinct directions.
  - A Node server is necessary because the Agent SDK runs in Node and authenticates with
    the Claude subscription; the browser can do neither safely. Keep the frontend
    dependency-free — all SDK/auth logic stays server-side.

## Key conventions

- **SDK call:** `query()` runs with `tools: []` (pure text generation, no filesystem/bash),
  `maxTurns: 1`, `thinking: { type: "disabled" }` (a logo needs no extended reasoning —
  cuts latency), `includePartialMessages: true` (emit token deltas for streaming),
  `settingSources: []` (don't load this CLAUDE.md/settings into the model), and a system
  prompt that forces a single self-contained SVG with `viewBox="0 0 512 512"`, no external
  fonts/images/scripts. The SVG is extracted with `/<svg[\s\S]*?<\/svg>/i`.
- **Auth:** the SDK reuses the logged-in `claude` CLI subscription automatically — no API
  key, nothing to configure.
- **Config:** `PORT` (default `3000`), `LOGO_MODEL` (default `sonnet`; `opus` for higher
  quality at more latency).
- **Run:** `npm install` then `npm start`. Generation takes ~30–80s per logo, but the SVG
  now streams in and draws progressively, so there's continuous visual feedback rather than
  a long static wait.

## Working on this app

- Keep the frontend pure HTML/CSS/JS — do not add a frontend framework or build step.
- Keep dependencies minimal (currently only `@anthropic-ai/claude-agent-sdk`); prefer Node
  built-ins over adding packages.
- Don't introduce API keys or move generation into the browser — subscription auth must
  stay server-side.
- When testing generation end-to-end, expect ~30–80s latency and that it consumes
  real Claude subscription quota.
