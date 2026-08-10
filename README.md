<div align="center">

<img src="./resources/icon.png" alt="Halo Gemma Logo" width="120" height="120">

# halo-gemma

### A locally-running AI agent desktop app powered by Gemma 4 via Ollama

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)](#installation)
[![Upstream](https://img.shields.io/badge/upstream-openkursar%2Fhello--halo-orange.svg)](https://github.com/openkursar/hello-halo)
[![Release](https://img.shields.io/github/v/release/wengjiyao/halo-gemma?label=stable)](https://github.com/wengjiyao/halo-gemma/releases/latest)
[![Development](https://img.shields.io/badge/dev-feature%2Flanggraph--agent-yellow)](https://github.com/wengjiyao/halo-gemma/tree/feature/langgraph-agent)

</div>

---

**halo-gemma** is a fork of [hello-halo](https://github.com/openkursar/hello-halo) stripped down and tuned to run exclusively with **Gemma 4 via [Ollama](https://ollama.com)** — no cloud API keys, no external services, everything on your machine.

It uses the [Claude Code SDK](https://github.com/anthropics/claude-code) as its agent loop engine. Claude Code SDK is an open-source, Apache 2.0 licensed tool from Anthropic that runs fully locally as a subprocess — no Anthropic API key or cloud connection is required. An in-process OpenAI-compatibility router bridges Claude Code SDK's Anthropic-format requests to Ollama's local API, so Gemma 4 handles all the actual inference.

---

## What's different from upstream hello-halo

| Area | hello-halo | halo-gemma |
|------|-----------|------------|
| Providers | 20+ cloud providers (Anthropic, OpenAI, Google, etc.) | Ollama only |
| Models | Any supported model | Gemma 4 (26B, 12B, 4B) |
| API keys | Required for cloud providers | Not required — `ollama` placeholder |
| Thinking mode | Enabled by default for reasoning models | Disabled (`think: false` sent to Ollama) |
| Setup wizard | Shown on first launch | Skipped — pre-configured for Ollama |
| System prompt | `official` / `halo` profiles | Added `gemma` profile (compact, no Claude-specific references) |
| Model capabilities | Claude-centric defaults | `gemma4` pattern: 131K context, 64K output |

---

## Prerequisites

- [Ollama](https://ollama.com) running locally on port `11434`
- Gemma 4 model pulled:

```bash
ollama pull gemma4:27b   # ~17 GB — recommended
ollama pull gemma4:12b   # ~8 GB
ollama pull gemma4:4b    # ~3 GB
```

- Node.js 20+, Yarn

---

## Installation

**Stable Release (Recommended):**
```bash
# Clone the latest stable release
git clone --branch v1.0.0 https://github.com/wengjiyao/halo-gemma.git
cd halo-gemma
cp product.example.json product.json   # required — product.json is gitignored
yarn install
```

**Development Version (Experimental):**
```bash
# Clone main branch (includes unreleased features)
git clone https://github.com/wengjiyao/halo-gemma.git
cd halo-gemma
git checkout main  # stable, but may include recent untagged commits
# or
git checkout feature/langgraph-agent  # experimental LangGraph POC
cp product.example.json product.json
yarn install
```

> **Note**: Always use tagged releases (e.g., `v1.0.0`) for production. Development branches may contain untested features.

---

## Usage

**Development mode** (live reload):
```bash
yarn dev
```

**Production build + run:**
```bash
yarn build
yarn start
```

The app launches directly into the chat interface — no setup wizard. It connects to Ollama at `http://localhost:11434` automatically.

---

## How it works

```
User input
    │
    ▼
Claude Code SDK (agent loop)
    │  Anthropic-format messages
    ▼
In-process OpenAI-compat router
    │  think: false  ·  max_tokens: 65536
    ▼
Ollama  →  gemma4:26b
    │
    ▼
Tool calls: web search · AI browser · file system
```

- The **Claude Code SDK** (Apache 2.0, runs locally — no Anthropic API key needed) handles the multi-turn agent loop, tool dispatch, session management, and auto-compaction of long conversations
- The **OpenAI-compat router** (built into hello-halo) translates Anthropic-format requests to Ollama's OpenAI-compatible endpoint
- `think: false` is injected into every request to prevent Gemma 4 from generating `<think>` tokens that would consume the entire output budget
- The **AI browser** runs as a hidden Electron `BrowserView` — the model navigates real websites without you seeing a window

---

## Key configuration

Model capabilities are registered in `src/shared/data/model-capabilities.json`:

```json
"gemma4": {
  "contextWindow": 131072,
  "maxOutputTokens": 65536,
  "vision": true,
  "thinking": false
}
```

The default model is `gemma4:26b`. To switch to a lighter model, change `model` in `src/main/foundation/config.service.ts` → `DEFAULT_CONFIG`.

---

## Roadmap

- [ ] Dynamic model list fetched from Ollama (support any locally pulled model)
- [ ] Support other thinking-capable Ollama models (deepseek-r1, qwq) with thinking enabled
- [ ] One-click installer / pre-built binary releases

---

## Credits

This project is a fork of [hello-halo](https://github.com/openkursar/hello-halo) by [OpenKursar](https://github.com/openkursar), licensed under MIT. The agent loop is powered by Anthropic's [Claude Code SDK](https://github.com/anthropics/claude-code). The local LLM runtime is [Ollama](https://ollama.com). Gemma 4 is developed by [Google DeepMind](https://deepmind.google/models/gemma/).

---

## License

MIT — see [LICENSE](LICENSE).

This project retains the original MIT license from hello-halo (Copyright © 2024–2025 OpenKursar) with modifications Copyright © 2026 wengjiyao.
