# Contributing to halo-gemma

Thanks for your interest in contributing to halo-gemma!

halo-gemma is a fork of [hello-halo](https://github.com/openkursar/hello-halo) tuned specifically for Gemma 4 via Ollama. Contributions that improve Ollama/Gemma compatibility, fix bugs, or make the setup simpler are especially welcome.

## Development Setup

**Prerequisites**: [Ollama](https://ollama.com) running locally with `gemma4:27b` (or `gemma4:12b`) pulled.

```bash
# Clone the repository
git clone https://github.com/wengjiyao/halo-gemma.git
cd halo-gemma

# Copy product config (required — product.json is gitignored)
cp product.example.json product.json

# Install dependencies
yarn install

# Start development server
yarn dev
```

## Troubleshooting

**`NODE_MODULE_VERSION` mismatch / better-sqlite3 crash**

The native module was compiled for system Node instead of Electron. Rebuild it:

```bash
npx electron-rebuild -f -w better-sqlite3
```

**App shows empty response or "Unexpected empty response"**

Gemma sometimes generates `<think>` blocks even when `think: false` is sent. The stream handler recovers from this automatically since commit `base-stream-handler` fix. If you see it, check the `[StreamHandler]` lines in Settings > System > Logs.

## Project Structure

```
src/
├── main/
│   ├── openai-compat-router/   # Anthropic → Ollama request/response translation
│   │   ├── converters/         # Request converters (think:false injected here)
│   │   └── stream/             # Stream handler (thinking recovery fix here)
│   └── services/
│       ├── agent/              # CC SDK integration, system prompts
│       └── web-search/         # Web search engines (Bing CAPTCHA handling here)
├── preload/
└── renderer/                   # React frontend
```

## Key Files for Gemma-Specific Changes

| File | What it does |
|------|-------------|
| `src/main/openai-compat-router/converters/request/anthropic-to-openai-chat.ts` | Injects `think: false` to suppress Gemma native thinking |
| `src/main/openai-compat-router/stream/base-stream-handler.ts` | Recovers thinking-only responses as text |
| `src/shared/data/model-capabilities.json` | `gemma4` pattern: 131K context, 64K output |
| `src/main/services/agent/system-prompt.ts` | `gemma` profile system prompt |
| `src/main/services/web-search/engines/bing.ts` | Bing CAPTCHA detection + browser fallback guidance |

## Tech Stack

- **Framework**: Electron + electron-vite
- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Agent loop**: Claude Code SDK (Apache 2.0, runs locally)
- **LLM**: Gemma 4 via Ollama

## Contributing Changes

```bash
# Create a branch
git checkout -b fix/your-description

# Make changes, test with yarn dev
yarn dev

# Commit
git commit -m "fix: description of what you fixed"

# Push and open a PR
git push origin fix/your-description
```

Please link any related issue in your PR description.

## Questions?

Open a [GitHub Issue](https://github.com/wengjiyao/halo-gemma/issues) or start a [Discussion](https://github.com/wengjiyao/halo-gemma/discussions).
