<div align="center">

# logomaker

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Claude Agent SDK](https://img.shields.io/badge/Claude%20Agent%20SDK-subscription-D97757?logo=anthropic&logoColor=white)](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

**Describe a logo in plain words and get three clean vector options — pick one and download it as SVG or PNG.**

[Report Bug](https://github.com/alfredang/logomaker/issues) · [Request Feature](https://github.com/alfredang/logomaker/issues)

</div>

## Screenshot

![Screenshot](screenshot.png)

## About

**logomaker** is a modern, minimalist web tool for generating logos from a text description. Type what you want, and Claude designs **three distinct vector logos** that stream in and draw live in front of you. Pick your favorite and download it as a scalable **SVG** or a 1024×1024 **PNG**.

It is built on the **Claude Agent SDK** and authenticates with your **Claude subscription** (via the logged‑in `claude` CLI) — **no API key required**. Claude writes the logo as self‑contained SVG markup, so every result is crisp at any size.

### Features

- **Describe → design** — generate a logo from a single plain‑language prompt.
- **Three variations per request** — distinct directions to choose from, generated in parallel.
- **Watch it draw** — each variant's SVG streams in and renders progressively as it's generated.
- **Pick and download** — select any variant, then export as **SVG** (vector) or **PNG** (1024×1024).
- **Subscription auth** — uses the Claude Agent SDK with your Claude subscription; no API key, nothing to configure.
- **Zero‑dependency frontend** — pure HTML/CSS/JavaScript, no framework, no build step.

## Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | HTML, CSS, vanilla JavaScript (no framework, no build) |
| Backend | Node.js (built‑in `http` server, no Express) |
| AI / LLM | [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) (`claude-opus`/`sonnet` via subscription) |
| Streaming | NDJSON over a streamed HTTP response (token‑level deltas) |
| Output | SVG (vector) · PNG (client‑side `<canvas>` render) |

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Browser  (pure HTML / CSS / JS — no framework, no build)  │
│                                                            │
│   describe ──▶ POST /api/generate ──▶ read NDJSON stream   │
│   3 variant tiles draw progressively  ◀── {delta,i,text}   │
│   pick one ──▶ download SVG / PNG (canvas)  ◀── {done,i,svg}│
└───────────────────────────┬───────────────────────────────┘
                            │  HTTP (localhost)
┌───────────────────────────▼───────────────────────────────┐
│  Node server  (server.js)                                  │
│   • serves /public  • POST /api/generate                   │
│   • runs 3 query() calls in parallel, streams NDJSON       │
└───────────────────────────┬───────────────────────────────┘
                            │  Claude Agent SDK  (query)
┌───────────────────────────▼───────────────────────────────┐
│  Claude  (via the logged‑in `claude` CLI — subscription)   │
│   returns one self‑contained <svg> per variation           │
└────────────────────────────────────────────────────────────┘
```

> A small Node server is required: the Claude Agent SDK runs in Node and authenticates with your subscription — neither can run in a browser, and a browser can't safely hold credentials. All AI/auth logic stays server‑side; the frontend stays dependency‑free.

## Project Structure

```
logomaker/
├── server.js          # Node http server: static files + POST /api/generate (streams NDJSON)
├── public/
│   ├── index.html     # minimalist UI: prompt, 3 variant tiles, downloads
│   ├── style.css      # clean, responsive, system-font design
│   └── app.js         # vanilla JS: stream reader, progressive SVG render, SVG/PNG export
├── package.json
├── CLAUDE.md          # project + contributor guidelines
└── README.md
```

## Getting Started

### Prerequisites

- **Node.js 18+** (developed on Node 22).
- The **`claude` CLI** installed and **logged in** to your Claude subscription. The Agent SDK reuses that login automatically — no API key needed.

### Install

```bash
git clone https://github.com/alfredang/logomaker.git
cd logomaker
npm install
```

### Run

```bash
npm start
```

Then open **http://localhost:3000**.

### Configuration

| Env var      | Default  | Description                                              |
| ------------ | -------- | -------------------------------------------------------- |
| `PORT`       | `3000`   | Port to serve on.                                        |
| `LOGO_MODEL` | `sonnet` | Claude model alias (`sonnet`, `opus`, `haiku`, `fable`). |

Example: `LOGO_MODEL=opus PORT=8080 npm start`

### Usage

1. Type a description, e.g. *"a mountain peak inside a rounded hexagon, minimal monoline, deep blue"*.
2. Click **Generate** (or press ⌘/Ctrl + Enter) and watch three options draw in.
3. Click a tile to **select** it, then **Download SVG** or **Download PNG** — or **Regenerate** for a new set.

## Deployment

logomaker needs a **Node.js host where the `claude` CLI is installed and authenticated** with your subscription. Run it on any always‑on Node environment (a VM, a container, or your own machine):

```bash
npm install
npm start        # honors PORT
```

> **Note:** Because generation relies on the Claude Agent SDK + the local `claude` subscription login, **serverless/edge platforms (e.g. Vercel/Netlify functions) cannot run the backend** — they can't spawn the CLI or hold the subscription session. Host the Node server on a persistent runtime instead.

## Contributing

Contributions are welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-idea`)
3. Commit your changes
4. Open a Pull Request

See [CLAUDE.md](CLAUDE.md) for the project's working guidelines (think before coding, simplicity first, surgical changes).

## License

Released under the MIT License.

## Developed By

**[Tertiary Infotech Academy Pte. Ltd.](https://www.tertiaryinfotech.com/)**

## Acknowledgements

- [Anthropic Claude](https://www.anthropic.com/) and the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- Built with [Claude Code](https://claude.com/claude-code)

<div align="center">

⭐ If you find this useful, consider starring the repo.

</div>
