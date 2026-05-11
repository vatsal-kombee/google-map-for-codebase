# AI-Powered Project Intelligence System
## Complete Technical Blueprint

> **Scope:** Production-grade codebase intelligence platform for natural language querying of entire repositories — ingestion, indexing, retrieval, reasoning, and response.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Ingestion Pipeline](#ingestion-pipeline)
3. [Storage Architecture](#storage-architecture)
4. [Retrieval & RAG Pipeline](#retrieval--rag-pipeline)
5. [AI Reasoning Layer](#ai-reasoning-layer)
6. [Advanced Features](#advanced-features)
7. [Technology Stack](#technology-stack)
8. [Bottlenecks & Mitigations](#bottlenecks--mitigations)
9. [Performance Optimization](#performance-optimization)
10. [Security Architecture](#security-architecture)
11. [Implementation Roadmap](#implementation-roadmap)

---

## System Overview

### 7-Layer Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1 — User Interface                                     │
│  Web UI · CLI · IDE Plugin · REST/gRPC API                   │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Layer 2 — API Gateway & Auth                                 │
│  Rate limiting · JWT/OAuth2 · Project isolation · Quotas     │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Layer 3 — Ingestion & Parsing Engine                         │
│  File walker · Language parsers · AST · Chunking · Metadata  │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Layer 4 — Multi-Store Storage                                │
│  Vector DB │ Graph DB │ Relational DB │ Object Store          │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Layer 5 — Retrieval & Ranking Engine                         │
│  ANN search · BM25 hybrid · Re-ranking · Graph traversal     │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Layer 6 — AI Reasoning & Context Assembly                    │
│  Project summarizer · Context packer · LLM orchestrator      │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Layer 7 — Response & Explanation                             │
│  Streaming answer · Citations · Code highlights · Confidence │
└──────────────────────────────────────────────────────────────┘
```

### Core Design Principles

- **Tenant isolation**: Per-project vector collections and database schemas
- **Incremental indexing**: SHA-256 file diffing — only changed files re-enter the pipeline
- **Multi-language AST**: Tree-sitter grammar for 30+ languages with unified schema
- **Hierarchical memory**: 4 tiers — ephemeral, session, project, global
- **Hybrid retrieval**: Dense + sparse + graph — never relying on a single modality
- **Streaming responses**: SSE-based streaming, tokens rendered as they arrive
- **Context window budgeting**: Deterministic allocation of 128K token budget per query

---

## Ingestion Pipeline

### Step 1: Recursive Folder Traversal

```python
class ProjectWalker:
    def walk(self, root_path: str, project_id: str) -> Iterator[FileRecord]:
        gitignore = load_gitignore(root_path)
        index_ignore = load_indexignore(root_path)
        
        for path in recursive_walk(root_path):
            if gitignore.matches(path) or index_ignore.matches(path):
                continue
            if is_binary_or_minified(path):  # entropy + size heuristics
                continue
                
            file_hash = sha256(path)
            stored_hash = db.get_file_hash(project_id, path)
            
            if file_hash == stored_hash:
                continue  # unchanged — skip entirely
                
            yield FileRecord(path=path, hash=file_hash, language=detect_language(path))
```

**Heuristics for skipping:**
- Files > 1MB without meaningful structure (likely generated/minified)
- Shannon entropy > 5.5 (binary/compressed)
- Extensions: `.lock`, `.min.js`, `.map`, `.pb`, `.wasm`

---

### Step 2: Language-Specific Parsing

**Supported languages via Tree-sitter:**

| Language      | Extract                                                         |
| ------------- | --------------------------------------------------------------- |
| Python        | functions, classes, decorators, type hints, docstrings, imports |
| TypeScript/JS | functions, classes, interfaces, types, exports, JSDoc           |
| Go            | functions, structs, interfaces, packages, goroutines            |
| Rust          | functions, structs, traits, impl blocks, macros                 |
| Java/Kotlin   | classes, methods, annotations, generics                         |
| Ruby/PHP      | classes, methods, modules, mixins                               |
| C/C++         | functions, structs, headers, templates                          |

**Non-code files:**

| File Type                     | Extract                                     |
| ----------------------------- | ------------------------------------------- |
| Markdown/RST                  | sections, headings, code blocks             |
| OpenAPI/Swagger               | endpoints, schemas, request/response shapes |
| Dockerfile                    | stages, base images, env vars               |
| package.json / pyproject.toml | dependencies, scripts, metadata             |
| .env.example                  | config keys (redacted values)               |
| SQL migrations                | table names, operations                     |

**Unified AST node schema:**
```json
{
  "node_id": "uuid",
  "type": "function | class | interface | import | export | config | doc",
  "name": "parseAuthToken",
  "file_path": "src/auth/tokenParser.ts",
  "start_line": 42,
  "end_line": 78,
  "language": "typescript",
  "parent_name": "AuthService",
  "docstring": "Parses and validates a JWT token...",
  "signature": "parseAuthToken(token: string, options?: ParseOptions): TokenPayload",
  "complexity_score": 4,
  "is_exported": true,
  "is_async": true
}
```

---

### Step 3: Intelligent Chunking

**Semantic boundary chunking** (not fixed-size):

```
Priority order of chunk boundaries:
  1. Class/module level  (for large files: one chunk per top-level symbol)
  2. Function/method level  (default: one chunk per function)
  3. Logical block level  (for functions > 100 lines: sub-chunk at control flow)
  4. Line-based fallback  (for non-parseable files)
```

**Chunk sizing rules:**
- Target: 200–800 tokens per chunk
- Maximum: 1200 tokens (hard limit)
- Overlap: 20% (≈ 50–150 tokens) for context continuity at boundaries
- For functions > 800 tokens: split at `if/for/while/try` boundaries

**Chunk metadata payload (stored alongside vector):**
```json
{
  "chunk_id": "uuid",
  "project_id": "uuid",
  "file_path": "src/payment/stripe.py",
  "start_line": 104,
  "end_line": 156,
  "symbol_name": "process_payment",
  "symbol_type": "function",
  "parent_symbol": "PaymentService",
  "language": "python",
  "chunk_type": "code",
  "token_count": 342,
  "file_hash": "sha256hex",
  "complexity": 7,
  "has_tests": true,
  "last_modified": "2025-01-15T10:23:44Z",
  "author": "alice@company.com",
  "centrality_score": 0.84
}
```

---

### Step 4: Metadata Extraction

**Call graph extraction:**
```python
def extract_call_edges(ast_node, file_path):
    """Returns (caller, callee, file) tuples for Neo4j CALLS edges."""
    edges = []
    for call_node in ast_node.find_all(type="call_expression"):
        caller = current_function_scope(call_node)
        callee = resolve_call_target(call_node, import_map)
        edges.append(CallEdge(
            caller=caller,
            callee=callee,
            caller_file=file_path,
            callee_file=resolve_file(callee, project_imports)
        ))
    return edges
```

**Metrics extracted per function:**
- Cyclomatic complexity (count of decision points + 1)
- LOC (non-blank, non-comment)
- Number of parameters
- Nesting depth
- External dependency count
- Test coverage % (if coverage.xml present)
- TODO/FIXME/HACK annotation count

---

### Step 5: Embedding Generation

**Dual-model strategy:**

```
Code chunks     → voyage-code-3 (1024 dims)    — syntax + semantics aware
Doc/config      → text-embedding-3-large (1536) — natural language optimized
Summaries       → text-embedding-3-large (1536) — for hierarchical retrieval
```

**Batching pipeline:**
```python
class EmbeddingPipeline:
    BATCH_SIZE = 64
    
    async def embed_batch(self, chunks: List[Chunk]) -> List[Vector]:
        code_chunks = [c for c in chunks if c.type == "code"]
        text_chunks = [c for c in chunks if c.type != "code"]
        
        code_vecs = await self.code_client.embed(
            [c.content for c in code_chunks],
            model="voyage-code-3",
            input_type="document"
        )
        text_vecs = await self.text_client.embed(
            [c.content for c in text_chunks],
            model="text-embedding-3-large"
        )
        return code_vecs + text_vecs
```

**Self-hosted alternative:** `nomic-embed-code` (Apache 2.0, runs on single A10 GPU) — 60% cost reduction for large repos.

---

### Step 6: Multi-Level Summarization

**Hierarchical bottom-up construction:**

```
Function/class  →  file summary  →  directory summary  →  project summary
     (LLM)             (LLM)              (LLM)                (LLM)
```

**Function-level summary prompt:**
```
Summarize this {language} {symbol_type} in 2-3 sentences.
Focus on: what it does, what it takes/returns, notable side effects.
Code:
{code}
```

**File-level summary prompt:**
```
Given these function summaries from {file_path}, write a 3-4 sentence
summary of this file's purpose, its main responsibilities, and its
relationship to other parts of the system.
Function summaries: {function_summaries}
```

**Project-level summary:** Synthesized from top-20 most central directory summaries (by Pagerank score), then compressed to ~500 tokens. Always included at the top of every query context window.

---

### Step 7: Graph Construction

**Neo4j schema:**

```cypher
// Nodes
CREATE (:File {path, language, loc, complexity, centrality})
CREATE (:Function {name, file_path, signature, is_exported, complexity})
CREATE (:Class {name, file_path, is_abstract})
CREATE (:Package {name, version, ecosystem})  // npm/pypi/cargo dep
CREATE (:Test {name, file_path, covers: [function_names]})

// Relationships
(:File)-[:IMPORTS]->(:File)
(:Function)-[:CALLS]->(:Function)
(:Class)-[:EXTENDS]->(:Class)
(:Class)-[:IMPLEMENTS]->(:Interface)
(:Test)-[:TESTS]->(:Function)
(:File)-[:DEPENDS_ON]->(:Package)
(:Function)-[:EXPORTED_FROM]->(:File)
```

**Pagerank computation:**
```cypher
CALL gds.pageRank.write('dependency-graph', {
  maxIterations: 20,
  dampingFactor: 0.85,
  writeProperty: 'centrality'
})
```

Run offline nightly or after full re-index. High-centrality nodes (score > 0.7) get a retrieval boost of +0.15 in reranking.

---

## Storage Architecture

### Multi-Store Design

| Store          | Purpose                             | Technology                  |
| -------------- | ----------------------------------- | --------------------------- |
| Vector DB      | Semantic chunk embeddings           | Qdrant (HNSW, IVF_PQ)       |
| Graph DB       | Dependency relationships            | Neo4j 5.x with GDS plugin   |
| Relational     | Index manifests, metadata, projects | PostgreSQL 16               |
| Cache          | Query results, embeddings, sessions | Redis 7 Cluster             |
| Object Storage | Raw files, AST caches, summaries    | S3 / Cloudflare R2          |
| Search         | BM25 keyword + regex                | Elasticsearch 8 / Typesense |

### Qdrant Collection Design

```python
# Separate collections per purpose for independent scaling
collections = {
    "{project_id}_code":       {"vectors": {"size": 1024, "distance": "Cosine"}},
    "{project_id}_docs":       {"vectors": {"size": 1536, "distance": "Cosine"}},
    "{project_id}_summaries":  {"vectors": {"size": 1536, "distance": "Cosine"}},
}

# Payload indexes for filtered retrieval
payload_indexes = [
    "language", "chunk_type", "file_path",
    "symbol_type", "has_tests", "complexity"
]
```

### PostgreSQL Schema (key tables)

```sql
-- Project index manifest
CREATE TABLE project_index (
    project_id      UUID PRIMARY KEY,
    snapshot_id     UUID,  -- current indexed version
    file_count      INT,
    chunk_count     INT,
    total_tokens    BIGINT,
    indexed_at      TIMESTAMPTZ,
    status          TEXT CHECK (status IN ('indexing', 'ready', 'failed'))
);

-- Symbol index for fast exact lookup
CREATE TABLE symbols (
    symbol_id       UUID PRIMARY KEY,
    project_id      UUID REFERENCES project_index,
    name            TEXT NOT NULL,
    qualified_name  TEXT,  -- "AuthService.parseToken"
    symbol_type     TEXT,  -- function, class, interface, etc.
    file_path       TEXT,
    start_line      INT,
    signature       TEXT,
    is_exported     BOOLEAN,
    chunk_id        UUID   -- reference to Qdrant chunk
);
CREATE INDEX ON symbols USING GIN(to_tsvector('english', name || ' ' || qualified_name));
CREATE INDEX ON symbols (project_id, name);
```

---

## Retrieval & RAG Pipeline

### Stage 1: Query Understanding

```python
class QueryAnalyzer:
    
    INTENT_TYPES = [
        "code_search",       # "where is payment handled?"
        "architecture",      # "summarize the system"
        "dependency_trace",  # "what depends on X?"
        "dead_code",         # "find unused functions"
        "explain",           # "how does auth work?"
        "general_qa",        # "what tech stack does this use?"
    ]
    
    def analyze(self, query: str, project_id: str) -> QueryPlan:
        intent = self.classify_intent(query)
        entities = self.extract_entities(query)  # symbol names, file paths
        filters = self.extract_filters(query)    # language, file pattern
        
        # HyDE: generate hypothetical code that would answer the query
        hyp_code = self.llm.generate(
            f"Write a short code snippet that would answer: {query}\n"
            f"Be concise. Use the same language style as the project."
        )
        
        return QueryPlan(
            intent=intent,
            entities=entities,
            filters=filters,
            hyde_embedding=embed(hyp_code),
            query_embedding=embed(query),
        )
```

### Stage 2: Parallel Hybrid Retrieval

```python
async def retrieve(plan: QueryPlan, project_id: str) -> List[RetrievedChunk]:
    
    results = await asyncio.gather(
        
        # Dense ANN search (using HyDE embedding for better recall)
        qdrant.search(
            collection=f"{project_id}_code",
            query_vector=plan.hyde_embedding,
            limit=40,
            query_filter=build_filter(plan.filters)
        ),
        
        # BM25 keyword search (critical for exact symbol names)
        elasticsearch.search(
            index=f"project_{project_id}",
            query={"multi_match": {
                "query": plan.query,
                "fields": ["content^1", "symbol_name^3", "file_path^2"]
            }},
            size=20
        ),
        
        # Summary retrieval for broad questions
        qdrant.search(
            collection=f"{project_id}_summaries",
            query_vector=plan.query_embedding,
            limit=5
        ),
        
        # Graph traversal for dependency questions
        neo4j.run_if_applicable(plan.intent, plan.entities)
    )
    
    return fuse_rrf(results)  # Reciprocal Rank Fusion
```

### Stage 3: Reciprocal Rank Fusion

```python
def fuse_rrf(result_lists: List[List[Result]], k=60) -> List[Result]:
    scores = defaultdict(float)
    for results in result_lists:
        for rank, result in enumerate(results):
            scores[result.id] += 1.0 / (k + rank + 1)
    
    # Centrality boost for high-pagerank files
    for id, score in scores.items():
        centrality = get_centrality(id)  # 0.0-1.0
        scores[id] = score * (1 + 0.15 * centrality)
    
    return sorted(all_results, key=lambda r: scores[r.id], reverse=True)
```

### Stage 4: Cross-Encoder Re-ranking

```python
# After RRF fusion: top-40 → top-12 via cross-encoder
candidates = rrf_results[:40]

# Cohere Rerank API
reranked = cohere.rerank(
    query=original_query,
    documents=[c.content for c in candidates],
    model="rerank-english-v3.0",
    top_n=12
)

# Alternative: local ColBERT-v2 (self-hosted, lower latency)
```

### Stage 5: Context Window Assembly

```python
CONTEXT_BUDGET = 120_000  # tokens (leaving 8K for system + response)

ALLOCATION = {
    "project_summary":    0.08,  # always first — orientation
    "directory_summaries": 0.22, # top relevant dirs
    "code_chunks":         0.50, # ranked retrieved chunks
    "dependency_context":  0.15, # related files (graph neighbors)
    "conversation_history": 0.05, # last 3 turns
}

def pack_context(query_plan, reranked_chunks, summaries):
    context_parts = []
    remaining = CONTEXT_BUDGET
    
    # Always include project summary
    context_parts.append(format_summary(project_summary))
    remaining -= count_tokens(project_summary)
    
    # Fill allocations in priority order
    for key, fraction in ALLOCATION.items():
        budget = int(CONTEXT_BUDGET * fraction)
        parts = fetch_parts(key, query_plan)
        for part in parts:
            tokens = count_tokens(part)
            if tokens <= remaining and tokens <= budget:
                context_parts.append(part)
                remaining -= tokens
                budget -= tokens
    
    return "\n\n".join(context_parts)
```

---

## AI Reasoning Layer

### LLM Prompt Architecture

```
SYSTEM PROMPT
═════════════
You are an expert code analyst for {project_name}.
Always cite specific file paths and line numbers.
If unsure, say so — do not invent code that doesn't exist.
Format code references as `file_path:line_number`.

PROJECT CONTEXT (always injected)
════════════════════════════════════
{project_summary}

RETRIEVED CONTEXT
══════════════════
[CHUNK 1] src/auth/tokenParser.ts (lines 42-78, score: 0.94)
{chunk_content_1}

[CHUNK 2] src/middleware/auth.py (lines 12-45, score: 0.89)
{chunk_content_2}

... (up to 12 chunks)

DEPENDENCY CONTEXT
═══════════════════
Files that import tokenParser.ts: [src/api/routes.ts, src/auth/middleware.ts]

USER QUERY
══════════
{user_query}
```

### Intent-Specific Prompt Templates

| Intent             | Prompt Addition                                                              |
| ------------------ | ---------------------------------------------------------------------------- |
| `explain`          | "Trace the flow step by step. Reference specific functions and files."       |
| `code_search`      | "List every file and function relevant to this. Be exhaustive."              |
| `architecture`     | "Describe the high-level design. Identify key layers and boundaries."        |
| `dependency_trace` | "Show the dependency chain. Start from the entry point."                     |
| `dead_code`        | "List only functions with no callers. Explain why each is likely dead code." |

### Response Post-Processing

```python
def post_process_response(raw_response: str, chunks: List[Chunk]) -> Response:
    # 1. Extract all code references (file:line patterns)
    refs = extract_code_references(raw_response)
    
    # 2. Validate references exist in index (anti-hallucination)
    valid_refs = [r for r in refs if symbol_exists(r)]
    invalid_refs = [r for r in refs if not symbol_exists(r)]
    
    # 3. Attach source citations to each paragraph
    paragraphs = split_paragraphs(raw_response)
    cited = attach_citations(paragraphs, chunks)
    
    # 4. Calculate confidence score
    confidence = calculate_confidence(
        rerank_scores=[c.score for c in chunks],
        invalid_ref_count=len(invalid_refs),
        query_coverage=semantic_coverage(query, chunks)
    )
    
    return Response(
        content=cited,
        citations=[Citation(chunk) for chunk in chunks],
        confidence=confidence,
        warnings=["Could not verify reference: " + r for r in invalid_refs]
    )
```

---

## Advanced Features

### Dead Code Detection Algorithm

```python
def find_dead_code(project_id: str) -> List[DeadCodeCandidate]:
    
    # Step 1: Get all exported symbols (potential entry points — skip these)
    exported = neo4j.query("""
        MATCH (f:Function {project_id: $pid})-[:EXPORTED_FROM]->(:File)
        RETURN f.qualified_name
    """, pid=project_id)
    
    # Step 2: Find functions with no callers
    uncalled = neo4j.query("""
        MATCH (f:Function {project_id: $pid})
        WHERE NOT ()-[:CALLS]->(f)
        AND NOT f.qualified_name IN $exported
        RETURN f
    """, pid=project_id, exported=exported)
    
    # Step 3: Filter out framework magic (decorators, reflection)
    candidates = [f for f in uncalled if not has_magic_decorator(f)]
    
    # Step 4: Cross-reference with test coverage
    for c in candidates:
        c.is_tested = coverage_db.is_covered(project_id, c.qualified_name)
        c.confidence = 0.95 if not c.is_tested else 0.60
    
    return sorted(candidates, key=lambda c: c.confidence, reverse=True)
```

### Incremental Re-indexing

```python
class IncrementalIndexer:
    
    def reindex_diff(self, project_id: str, changed_files: List[str]):
        for file_path in changed_files:
            # 1. Delete old chunks from vector store
            qdrant.delete(
                collection=f"{project_id}_code",
                points_selector=Filter(must=[
                    FieldCondition(key="file_path", match=MatchValue(value=file_path))
                ])
            )
            
            # 2. Delete old graph edges for this file
            neo4j.run("""
                MATCH (f:File {path: $path, project_id: $pid})
                DETACH DELETE f
            """, path=file_path, pid=project_id)
            
            # 3. Re-parse and re-embed
            chunks = parse_and_chunk(file_path)
            vectors = embed_batch(chunks)
            qdrant.upsert(f"{project_id}_code", vectors)
            
            # 4. Rebuild graph edges for this file
            edges = extract_edges(file_path)
            neo4j.create_edges(edges)
            
            # 5. Invalidate summary chain upward
            invalidate_summaries_upward(file_path, project_id)
        
        # 6. Trigger async summary regeneration
        queue.enqueue(regenerate_summaries, project_id, changed_files)
```

### Semantic Caching

```python
class SemanticCache:
    SIMILARITY_THRESHOLD = 0.95
    TTL = 1800  # 30 minutes
    
    async def get(self, query: str, project_id: str) -> Optional[CachedResponse]:
        query_vec = await embed(query)
        
        # Search cache index (small, fast Qdrant collection)
        results = qdrant.search(
            collection=f"cache_{project_id}",
            query_vector=query_vec,
            limit=1,
            score_threshold=self.SIMILARITY_THRESHOLD
        )
        
        if results and not self._is_expired(results[0]):
            return redis.get(f"response:{results[0].id}")
        return None
    
    async def set(self, query: str, response: str, project_id: str):
        query_vec = await embed(query)
        cache_id = uuid4()
        qdrant.upsert(f"cache_{project_id}", [(cache_id, query_vec)])
        redis.setex(f"response:{cache_id}", self.TTL, response)
```

---

## Technology Stack

### Core Infrastructure

| Category       | Technology                   | Rationale                                                                               |
| -------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| Vector DB      | **Qdrant**                   | HNSW + payload filtering + multi-vector + Rust native; pgvector for simpler deployments |
| Graph DB       | **Neo4j 5** with GDS         | Cypher for dependency traversal; FalkorDB (Redis-backed) for lower latency reads        |
| Relational DB  | **PostgreSQL 16**            | Index manifest, metadata, symbol table, RBAC                                            |
| Cache          | **Redis 7 Cluster**          | Semantic cache, job queue, pub/sub for index events                                     |
| Object Storage | **S3 / Cloudflare R2**       | Raw snapshots, AST blobs, summary JSON                                                  |
| Search (BM25)  | **Elasticsearch 8**          | Keyword search, exact symbol lookup, regex; Typesense for simpler scale                 |
| AST Parser     | **Tree-sitter**              | 30+ language grammars, incremental parsing, WASM for edge                               |
| Message Queue  | **Redis Streams + BullMQ**   | Ingestion job orchestration, priority queues                                            |
| API Framework  | **FastAPI**                  | Async, SSE streaming, Pydantic, auto-generated OpenAPI                                  |
| Worker Runtime | **Celery**                   | Distributed ingestion workers; GPU workers for local embedding                          |
| Observability  | **OpenTelemetry + Langfuse** | Trace every RAG step; LLM-specific cost/latency dashboards                              |
| Infrastructure | **Kubernetes + Helm**        | Auto-scale workers, vector DB, API tier independently                                   |

### AI / ML Stack

| Category          | Technology                     | Rationale                                                  |
| ----------------- | ------------------------------ | ---------------------------------------------------------- |
| Code Embeddings   | **voyage-code-3**              | SOTA code retrieval; 1024 dims; context-aware              |
| Text Embeddings   | **text-embedding-3-large**     | For docs, configs, summaries                               |
| Self-Hosted Embed | **nomic-embed-code**           | Apache 2.0; A10 GPU; 60% cost reduction                    |
| LLM               | **Claude Sonnet 4.5 / GPT-4o** | 128K+ context; Claude preferred for long-context coherence |
| Re-ranker         | **Cohere Rerank v3**           | Cross-encoder; ColBERT-v2 for self-hosted                  |
| Local LLM         | **Ollama + Qwen2.5-Coder**     | Air-gapped enterprise deployments                          |

---

## Bottlenecks & Mitigations

### Context Window Saturation

**Problem:** Large repos have millions of tokens — naive retrieval overflows context.

**Mitigations:**

- Hierarchical summaries retrieved first; raw chunks only on drill-down
- Deterministic budget allocation (see Context Assembly)
- Multi-hop retrieval for complex multi-component questions
- Chunk-level confidence filtering — drop low-scoring chunks before context packing

### Embedding Throughput

**Problem:** 1M tokens = 3-4 hours with API rate limits. Unacceptable for large repos.

**Mitigations:**
- Parallel batching (64 chunks/request) across multiple API keys
- Self-hosted embedding model for bulk ingest (nomic-embed-code on GPU)
- Priority queue: active files first, background files in off-peak
- Incremental mode: only changed files (typically < 2% on a PR)

### Vector Search Recall Failure

**Problem:** Code queries contain exact identifiers; dense vectors miss exact matches.

**Mitigations:**
- Mandatory hybrid retrieval (never dense alone)
- BM25 with 3× boost on symbol_name field
- PostgreSQL symbol table as exact fallback for known identifiers
- HyDE improves dense recall by 15-25% for semantic queries

### AST Parsing Failures

**Problem:** Malformed code, preprocessor macros, generated protobuf files.

**Mitigations:**
- Fallback to line-based chunking on parse error (logged)
- Skip files matching generated-file heuristics (header comment patterns)
- Track parse failure rate per language in monitoring dashboard
- Parse failure ≠ skip: still embed with line chunking, just lower quality

### LLM Hallucination

**Problem:** LLM invents function signatures or file paths not in codebase.

**Mitigations:**
- Post-processing validates all `file:line` references against symbol index
- Responses flagged when > 2 unverified references detected
- System prompt explicitly instructs: "Do not invent code. If unsure, say so."
- Confidence score shown to user alongside answer

---

## Performance Optimization

### HyDE (Hypothetical Document Embeddings)

Generate a hypothetical code snippet that would answer the query, embed that instead of the raw query. Improves code retrieval recall by 15-30% because question phrasing diverges from code style.

```python
# Instead of embedding "where is payment processed?"
# Embed: "def process_payment(amount, card_token): stripe.charge(...)"
hyde_query = llm.generate(f"Write a code snippet that would answer: {user_query}")
search_vector = embed_code(hyde_query)  # Much closer to actual code vectors
```

### Pagerank-Weighted Retrieval

Files that many others import have higher architectural relevance. Boost their chunks in reranking:

```python
rerank_score = base_score * (1 + 0.15 * centrality_score)
```

### Adaptive Chunk Granularity

For initial broad queries → retrieve file summaries only (1 chunk per file).
On follow-up ("tell me more about X") → drill into function-level chunks.

Saves 70-80% of context budget for architecture overview questions.

### Semantic Caching Impact

- Cache hit rate: ~35-45% in multi-user teams (same project, similar questions)
- Latency improvement: 3-5 seconds → < 50ms on cache hit
- Cost reduction: 40-60% on LLM API spend

### Indexing Performance Targets

| Stage                           | Target         | At Scale                |
| ------------------------------- | -------------- | ----------------------- |
| Full index (100K LOC)           | < 10 minutes   | Parallelized            |
| Incremental (PR diff, 50 files) | < 30 seconds   | Priority queue          |
| Query latency (P50)             | < 1.5 seconds  | Cached: < 100ms         |
| Query latency (P99)             | < 5 seconds    | Complex graph traversal |
| Embedding throughput            | 500 chunks/min | Self-hosted GPU         |

---

## Security Architecture

### Data Isolation

- Each project in a dedicated Qdrant collection (no cross-tenant vector access possible)
- Separate PostgreSQL schema per organization
- Neo4j project property filter enforced at query level + row-level security

### Encryption

- Code chunks encrypted at rest (AES-256) in S3/R2
- Vectors stored without raw code content — only chunk metadata + embedding (vectors are not trivially reversible)
- TLS 1.3 in transit everywhere
- Database credentials rotated every 30 days via Vault

### Access Control

```
Role hierarchy:
  org:admin       → full project management + user management
  project:editor  → query + re-index + settings
  project:viewer  → query only
  api:readonly    → read-only API key (CI integration)

Controls:
  - JWT per session (15min expiry + refresh)
  - Project-scoped API keys (hashed in DB)
  - Audit log: every query + response stored (30-day retention)
  - IP allowlist for enterprise tenants
```

### Secret Scanning

Integrate Gitleaks before indexing:
```python
def scan_for_secrets(file_content: str) -> List[SecretMatch]:
    """Run Gitleaks patterns before embedding. Flag and redact."""
    matches = gitleaks.scan(file_content)
    if matches:
        audit_log.warn(f"Secrets detected in {file_path}: {[m.type for m in matches]}")
        return redact_secrets(file_content, matches)
    return file_content
```

### Compliance

- GDPR: Code content deletable per project (cascades to all stores)
- SOC2 controls: Audit logging, encryption at rest, access reviews
- Air-gapped deployment: Swap cloud LLM/embedding for Ollama + nomic-embed-code

---

## Implementation Roadmap

### Phase 1 — MVP (Weeks 1–8)

**Goal:** Working demo for a single project, single user.

| Week | Deliverable                                       |
| ---- | ------------------------------------------------- |
| 1-2  | Folder upload, file walker, language detection    |
| 2-3  | Tree-sitter parsing (Python, JS, TS, Go, Java)    |
| 3-4  | Chunking, metadata extraction, OpenAI embeddings  |
| 4-5  | Qdrant setup, basic dense retrieval               |
| 5-6  | FastAPI backend, streaming SSE responses          |
| 6-7  | Simple React web UI, file upload UX               |
| 7-8  | Basic caching (Redis), project summary generation |

**MVP capabilities:** Ask any natural language question, get a sourced answer. No graph, no incremental, single tenant.

**Key metrics to hit:** < 3s P50 query latency. Successfully answer "explain auth flow" and "where is X handled?" for a 50K LOC project.

---

### Phase 2 — Mid-Scale (Weeks 9–20)

**Goal:** Multi-tenant SaaS, production-quality retrieval.

| Feature                                            | Effort    |
| -------------------------------------------------- | --------- |
| BM25 hybrid retrieval (Elasticsearch)              | 1 week    |
| Cross-encoder re-ranking (Cohere)                  | 3 days    |
| Neo4j dependency graph construction                | 1.5 weeks |
| AST symbol index (PostgreSQL)                      | 1 week    |
| Hierarchical summaries (function→file→dir→project) | 1 week    |
| Semantic query cache (Redis)                       | 3 days    |
| Incremental re-indexing (SHA-256 diff)             | 1 week    |
| Multi-tenant isolation + JWT auth                  | 1 week    |
| Langfuse + OpenTelemetry observability             | 3 days    |
| Git webhook for auto-reindex                       | 4 days    |

**Phase 2 capabilities:** Dead code detection, dependency tracing ("which files depend on X?"), incremental updates on push, 40+ language support.

---

### Phase 3 — Enterprise (Weeks 21+)

**Goal:** On-premises, compliance, IDE integration, team features.

| Feature                                 | Notes                                           |
| --------------------------------------- | ----------------------------------------------- |
| SSO (SAML/OIDC) + RBAC                  | Okta, Azure AD integration                      |
| Audit logging + data retention controls | GDPR/SOC2 compliance                            |
| Self-hosted LLM option                  | Ollama + Qwen2.5-Coder 72B                      |
| Self-hosted embeddings                  | nomic-embed-code on A10 GPU                     |
| VS Code / JetBrains plugin              | Query from IDE, inline citations                |
| CI/CD integration                       | Pre-commit: "does this PR break any contracts?" |
| Pagerank-weighted retrieval             | Offline nightly computation                     |
| On-premises K8s Helm chart              | Air-gapped deployment                           |
| SLA + HA guarantees                     | Multi-region Qdrant, Postgres HA                |
| Custom model fine-tuning                | Fine-tune on codebase-specific conventions      |

---

## Query → Strategy Reference

| Query Pattern                | Retrieval Strategy                                            |
| ---------------------------- | ------------------------------------------------------------- |
| "Explain X flow"             | Hybrid dense (HyDE) + summary layer for architecture          |
| "Where is X handled?"        | BM25 keyword (3× boost on symbol name) + dense                |
| "Find dead code"             | Graph analysis (in-degree=0) + coverage join — no vectors     |
| "Which files depend on X?"   | Neo4j BFS from X node via IMPORTS/CALLS edges                 |
| "Summarize architecture"     | Directory summaries only — no raw chunks (80% token savings)  |
| "What breaks if I change X?" | Graph: find all CALLS/IMPORTS paths to X                      |
| "Find all TODOs"             | BM25 regex on "TODO                                           | FIXME | HACK" across all chunks |
| "How is Y tested?"           | Graph: Test nodes with TESTS edge to symbol Y                 |
| "What does this file do?"    | File summary retrieval + top-5 function chunks                |
| "List all API endpoints"     | OpenAPI chunks + function chunks with HTTP decorator patterns |

---

*Blueprint version 1.0 — Designed for scalability from MVP to enterprise-grade deployment.*
*Estimated team: 2-3 backend engineers, 1 ML engineer, 1 infrastructure engineer for full build-out.*