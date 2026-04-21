## Google Maps for Codebases (Starter)

Paste a public GitHub repo URL, then ask questions and see a **real import-based dependency graph** update alongside a repo explorer, code viewer, and chat.

### Setup

1) Install dependencies:

```bash
npm install
```

2) (Optional) increase GitHub rate limits:

Create `.env.local`:

```bash
GITHUB_TOKEN=github_pat_...
```

3) Run:

```bash
npm run dev
```

Open `http://localhost:3000`.

### LLM provider

- Default is **Ollama** at `http://localhost:11434/v1` with model `qwen2.5`.
- To change provider/model, `POST /api/settings` with JSON:

```json
{ "baseURL": "https://api.openai.com/v1", "apiKey": "…", "model": "gpt-5.2" }
```

This is stored as an **httpOnly cookie** so the key is not exposed to browser JS.

### Language support

- **JS/TS/Vue/React**: import-based dependency edges (works now)
- **PHP**: basic `include/require` edges (string literal paths only; PSR-4 is a next step)
- **.NET**: placeholder adapter (needs `.sln/.csproj` resolution to map `using` → files)

