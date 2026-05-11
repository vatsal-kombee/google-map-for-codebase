# CLAUDE.md

## Core Rule: Understand Code Before Answering

**MANDATORY** — before answering ANY question about this codebase:

1. **Read all relevant files** using Read/Grep/Glob tools — not just the file mentioned, but all files in the call chain
2. **Trace actual code paths** — follow imports, function calls, data flow across files
3. **Understand the full context** — read types, interfaces, store state, hooks, API routes as needed
4. **Cite specific file:line references** in every answer

Never answer from assumptions, training data, or filenames alone. If unsure which files are relevant, search first.

### What "understand the code" means

- For a feature question: read the component, its hooks, the store slice it uses, and any API routes it calls
- For a bug question: read the exact function, its callers, and the data flowing through it
- For an architecture question: read multiple files across layers before describing the system
- For a "how does X work" question: trace X from entry point to output, reading each file in the path

### Never do this

- Describe behavior of a function without reading it
- Assume a file does X because its name suggests X
- Answer from memory of prior conversation without re-reading current code state
- Summarize architecture without reading actual source files

This rule applies to ALL questions — simple or complex, short or long.
