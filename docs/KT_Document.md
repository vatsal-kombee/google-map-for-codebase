# 🗺️ Knowledge Transfer: Google Maps for Codebases

Welcome to **Google Maps for Codebases**! This project allows developers to visually explore GitHub repositories, view automated dependency graphs, and interact with the code using an AI copilot. 

This document serves as a Knowledge Transfer (KT) guide to help you quickly understand the architecture, state management, key flows, and how the core features are built.

---

## 1. High-Level Architecture & Tech Stack

The application is built on modern web tech and is fully client-side heavy, relying on a few lightweight backend API routes for proxying requests.

**Tech Stack:**
- **Framework:** Next.js 14 (App Router)
- **UI & Layout:** React 18, Tailwind CSS v4
- **State Management:** Zustand (Single global store)
- **Graphing Engine:** React Flow (UI) + Dagre (Auto-layout calculating)
- **AI/Copilot Context:** CopilotKit (Frontend Chat UI + runtime)
- **Third Party:** Octokit (GitHub API Proxy)

---

## 2. Global State Management (Zustand)

All the moving parts (Repo tree, Graph, Code viewer, AI analysis) must stay in sync. We use a single global Zustand store defined in `src/store/appStore.ts`.

### Slices:
1. **`repo`**: State relating to the GitHub repository.
   - `tree`: Nested tree of directories and files.
   - `filePaths`: Flattened array of all file path strings.
   - `selectedFile`: Which file is currently selected by the user.
2. **`visualization`**: Everything drawn by React Flow.
   - `graphType`: Distinct whether we are showing `"architecture"` (top level folders) or `"dependency"` (real import dependencies).
   - `nodes` & `edges`: Standard React Flow object arrays.
3. **`codeViewer`**: Handles the right-side text visualization.
   - `content`: Raw file contents.
   - `highlightedLines`: Which lines the AI tool requested to highlight.
4. **`analysis`**: Tracks AI analysis statuses (Loading, explanations, relevant files targeted).

---

## 3. Core Capabilities & Workflows

### Flow A: Loading a Repository
**Hook:** `useRepository.ts`
1. The user pastes a GitHub URL into the `RepoLoader` component.
2. We call our Next.js API `/api/github/tree?repoUrl=...` which uses `Octokit` to fetch the complete file tree recursively.
3. The hook stores the nested tree in Zustand (`s.repo.tree`).
4. **Immediate Graph Generation:** `buildOverviewGraph()` (in `src/lib/graph.ts`) runs immediately. It looks at top-level directories, counts files in them, and draws an `"architecture"` graph using Dagre for layout.

### Flow B: Viewing Code
**Component:** `RepoExplorerPanel`, `CodeViewerPanel`
1. When a user clicks a file in the tree, we call `fetchFileCached()` (`src/lib/fetchFileCached.ts`).
2. This checks local memory cache. If missing, calls `/api/github/file`.
3. The file is mapped into the `codeViewer` state.
4. The `CodeViewerPanel` renders line by line, honoring any highlight arrays requested by AI.

### Flow C: AI Tools & Dependency Graphing 
**Hook:** `useCopilotTools.ts`
This is where the magic happens! We define a set of tools that the CopilotKit AI can call during chat:
- `fetchFileContent`: Tells UI to open a specific file.
- `highlightCode`: Tells UI to open a file and highlight specific lines.
- `analyzeRepository`: The **heaviest command**. 

**How `analyzeRepository` works:**
1. AI decides to analyze a query (e.g., "How does authentication work?").
2. We run `findFilesByQuery(filePaths, query)` to fetch likely candidates without reading entire source files.
3. We parallel fetch the source code for the top files using `fetchFileCached`.
4. We pass the source code into the **Analyzers** (`src/lib/analyzers`).
5. Analyzers extract imports (e.g., regex checks for `import x from y`, `require(x)`, `using y`).
6. We build a dependency graph (`buildDependencyGraph`) by matching those raw import strings to actual known file paths (`resolveImport`).
7. We update the UI to show the new `"dependency"` graph connecting the exact files involved.

---

## 4. Key Directories & Modules

Here is where to look if you need to build or fix features:

- **`src/app/api/`**: The backend. 
  - `copilotkit/route.ts`: Proxies chat to the LLM.
  - `github/...`: Proxies the GitHub API to avoid leaking tokens to the client.
  - `settings/route.ts`: Switches LLMs via `httpOnly` cookies (e.g., swapping OpenAI to Ollama).
  
- **`src/components/panels/`**: The four main screen quadrants.
  - `RepoExplorerPanel`: Visual file tree.
  - `GraphPanel`: Instantiates React Flow.
  - `CodeViewerPanel`: Displays the raw text and highlights.
  - `ChatPanel`: Contains the `<CopilotChat>` interface.

- **`src/lib/analyzers/`**: Language Adapters for building the dependency graph.
  - `jsTs.ts`: Handles ES6 imports, CommonJS requires, resolving `.tsx`, `@/`, aliases. Full support.
  - `php.ts`: Extracts `require`/`include` literal strings.
  - `dotnet.ts`: Dummy placeholder. A good place to pick up a future ticket.

- **`src/hooks/useCopilotContext.ts`**:
  Feeds real-time system context *into* the LLM. It limits the file tree listing to 80 paths to keep local models fast and provides rules so the AI knows when to "highlight" vs "analyze".

---

## 5. Potential Gotchas / Pain Points to Watch 

1. **GitHub Rate Limits:** Fetching large repos means a lot of API hits. Make sure you set a `GITHUB_TOKEN` in `.env.local` to bump your rate limit from 60 to 5,000 per hour.
2. **Context Window Size:** We flatten out the file tree and pass paths to CopilotKit context. Currently limited to 80 paths (`slice(0, 80)`) so local models (Ollama) don't hallucinate or timeout. If using GPT-4-turbo exclusively, this could be bumped higher.
3. **Graph Auto-Layout:** Dagre handles the positions (X/Y) of nodes. Dagre isn't reactive, so whenever nodes/edges change, we completely recalculate and overwrite the `position` data in `src/lib/graph.ts`.
4. **Client-Side LLM Credentials:** We NEVER expose OpenAI API keys to the browser state. We use an API route `POST /api/settings` to store credentials as an `httpOnly` cookie parsed securely by the `copilotkit/route.ts` backend wrapper logic (`src/lib/llmConfig.ts`).

---

## 6. Where you might start contributing:

1. **Improve Analyzers:** Implement legitimate path resolution for `.NET` or `Python` inside `src/lib/analyzers/`.
2. **Graph Expansion:** Allow users to double-click a node on the Dependency Graph to recursively fetch and append its imports to the visual tree. (Right now, analysis is purely AI-command driven).
3. **Loading UX:** Add better loading spinners specifically when the AI tool is executing the `analyzeRepository` task, as it can take few seconds and seems blocked.

Happy coding! Let me know if you need to pair or have questions on specific chunks!
