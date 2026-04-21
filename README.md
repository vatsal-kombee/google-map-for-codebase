# 🗺️ Google Maps for Codebases

> **Navigate any GitHub repository like a map** — paste a public repo URL, explore its structure, visualize import-based dependency graphs, and chat with an AI copilot that understands the code.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **Repo Explorer** | Browse any public GitHub repository's file tree directly in the browser |
| 🕸️ **Dependency Graph** | Auto-generated, interactive graph showing import relationships between files |
| 💬 **AI Chat Copilot** | Ask questions about the codebase and get contextual answers powered by LLMs |
| 📄 **Code Viewer** | Read source files with syntax highlighting without leaving the app |
| ⚡ **Multi-Language** | Supports JS/TS/React/Vue, PHP, and .NET dependency analysis |

---

## 🏗️ Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **UI:** [React 18](https://react.dev/) + [Tailwind CSS 4](https://tailwindcss.com/)
- **Graph Visualization:** [React Flow](https://reactflow.dev/) + [Dagre](https://github.com/dagrejs/dagre) (auto-layout)
- **AI Integration:** [CopilotKit](https://www.copilotkit.ai/) + [OpenAI SDK](https://platform.openai.com/)
- **State Management:** [Zustand](https://zustand.docs.pmnd.rs/)
- **GitHub API:** [Octokit](https://github.com/octokit/rest.js)
- **Validation:** [Zod](https://zod.dev/)

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** (comes with Node.js)
- **Ollama** (optional — for local LLM inference) → [Install Ollama](https://ollama.com/)

### Installation

1. **Clone the repository:**

```bash
git clone https://github.com/SumitKeshri12/google-map-for-codebase.git
cd google-map-for-codebase
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment variables** _(optional)_:

Create a `.env.local` file in the project root:

```env
# (Optional) Increase GitHub API rate limits from 60 → 5,000 req/hr
GITHUB_TOKEN=github_pat_...

# (Optional) Use OpenAI instead of local Ollama
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
```

4. **Start the development server:**

```bash
npm run dev
```

5. **Open** [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧠 LLM Provider Configuration

By default, the app connects to a **local Ollama** instance at `http://localhost:11434/v1` using the `qwen2.5` model.

### Option A: Use Ollama (Local / Free)

```bash
# Install and run the model
ollama pull qwen2.5
ollama serve
```

### Option B: Use OpenAI

Set `OPENAI_API_KEY` in your `.env.local` file (see above), or configure at runtime via the Settings API:

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{ "baseURL": "https://api.openai.com/v1", "apiKey": "sk-...", "model": "gpt-4o-mini" }'
```

### Option C: Any OpenAI-Compatible Endpoint

You can point to any provider that exposes an OpenAI-compatible API (e.g., Azure OpenAI, Together AI, Groq):

```json
{ "baseURL": "https://your-provider/v1", "apiKey": "...", "model": "model-name" }
```

> **🔒 Security:** LLM credentials are stored as an `httpOnly` cookie — they are never exposed to client-side JavaScript.

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── copilotkit/     # CopilotKit AI runtime endpoint
│   │   ├── github/         # GitHub API proxy (tree & file fetching)
│   │   └── settings/       # LLM configuration endpoint
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main application page
├── components/
│   ├── AppShell.tsx        # Main app layout with resizable panels
│   ├── RepoLoader.tsx      # Repository URL input component
│   └── panels/
│       ├── ChatPanel.tsx       # AI chat interface
│       ├── CodeViewerPanel.tsx # Source code viewer
│       ├── GraphPanel.tsx      # Dependency graph visualization
│       └── RepoExplorerPanel.tsx # File tree explorer
├── hooks/                  # Custom React hooks
│   ├── useCopilotContext.ts
│   ├── useCopilotTools.ts
│   └── useRepository.ts
├── lib/
│   ├── analyzers/          # Language-specific dependency analyzers
│   │   ├── jsTs.ts         # JS/TS/Vue/React analyzer
│   │   ├── php.ts          # PHP analyzer
│   │   └── dotnet.ts       # .NET analyzer
│   ├── graph.ts            # Graph building utilities
│   ├── tree.ts             # File tree utilities
│   ├── llmConfig.ts        # LLM configuration management
│   ├── octokit.ts          # GitHub API client setup
│   └── fetchFileCached.ts  # Cached file fetching
└── store/
    ├── appStore.ts         # Zustand global state
    └── types.ts            # TypeScript type definitions
```

---

## 🌐 Language Support

| Language | Analysis Type | Status |
|----------|--------------|--------|
| **JavaScript / TypeScript** | `import` / `require` dependency edges | ✅ Full support |
| **React / Vue** | Component imports & module resolution | ✅ Full support |
| **PHP** | `include` / `require` edges (string literal paths) | ⚠️ Basic support |
| **.NET (C#)** | `using` directives | 🔧 Placeholder (needs `.sln`/`.csproj` resolution) |

---

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Create optimized production build |
| `npm start` | Run production server |
| `npm run lint` | Run ESLint checks |

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ using Next.js, React Flow, and CopilotKit
</p>
