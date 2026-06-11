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

A modern, minimalist web tool: the user describes a logo and the app generates **three**
logo options to pick from, downloadable as **PNG**. Generation runs **entirely in the
browser** — there is **no backend**. The user brings their own API key for **Google Gemini
2.5 Flash Image ("nano banana")** or **OpenAI `gpt-image-1`**. It deploys as a static site
to **GitHub Pages** (via GitHub Actions).

> History: this started as a Node app using the Claude Agent SDK (subscription auth) to
> generate **SVG**. It was deliberately rewritten into a static, BYO‑key, image‑model app
> so it could be hosted on GitHub Pages. The Node server, the Agent SDK, and SVG output are
> gone — don't reintroduce them unless the goal changes back.

## Architecture

- **Static frontend** (`public/`) — pure HTML/CSS/JavaScript, no framework, no build step.
  - `index.html` — full‑width, single‑viewport (`100vh`, no page scroll) UI: a top bar with
    brand + provider `<select>` + API‑key input + theme toggle; a prompt row; three result
    tiles; a bottom bar with the pick hint, download, and footer credit.
  - `style.css` — light/dark themes via CSS variables on `[data-theme]`. `[hidden] { display:
    none !important; }` is required because several toggled elements set an explicit `display`.
  - `app.js` — calls the image API **directly from the browser** with the user's key.
    Generates **3 variations in parallel** (`generateGemini` / `generateOpenAI`), renders each
    as an `<img>` tile, auto‑selects the first to finish, lets the user click to re‑select, and
    downloads the selected image as PNG. Also handles theme + key/provider persistence.
- **No backend.** The browser → provider call is what makes the fully static GitHub Pages
  hosting possible.

## Key conventions

- **Providers:** Gemini is the default and the CORS‑friendly path. Gemini endpoint:
  `generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=…`
  with `generationConfig.responseModalities: ["TEXT","IMAGE"]`; the image comes back as a
  part with `inlineData` (base64). `GEMINI_MODEL` is a constant in `app.js` — update it if
  Google renames the model. OpenAI uses `POST /v1/images/generations` (`gpt-image-1`,
  `b64_json`) and may be CORS‑blocked from the browser.
- **Keys/state in `localStorage`:** `logomaker_provider`, `logomaker_key_gemini`,
  `logomaker_key_openai`, `logomaker_theme`. The key is sent straight to the provider — never
  put a shared/privileged key in this app, and never add a server that proxies it.
- **Output is raster PNG** (image models don't return vector SVG).
- **Run locally:** serve `public/` statically (`cd public && python3 -m http.server 4500`).
- **Deploy:** `.github/workflows/deploy.yml` uploads `public/` to GitHub Pages on push to
  `main`. Asset paths in `index.html` are **relative** (`style.css`, `app.js`) so the site
  works under the `/logomaker/` project‑pages base path.

## Working on this app

- Keep it a pure static site — no framework, no build step, no backend, no npm dependencies.
- Don't reintroduce a server or proxy the API key; BYO‑key client‑side is the design.
- Generation can't be tested without a real Gemini/OpenAI key. UI, theme, key persistence,
  layout, and the no‑key guard are testable without one.
