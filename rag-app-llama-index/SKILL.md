---
name: rag-app
description: >
  Build a complete, production-ready RAG (Retrieval-Augmented Generation) application
  with a web UI from scratch. Use this skill whenever a user asks to build a RAG app,
  document Q&A system, chat over documents, knowledge base chatbot, document search
  assistant, or any system where an LLM should answer questions using a private document
  collection. Triggers include: "build a RAG app", "chat with my documents", "Q&A over
  PDFs", "knowledge base chat", "document assistant", "index my files and answer
  questions", "build a document chatbot", "RAG pipeline with UI", or any variation of
  "I want to ask questions about my documents". Always use this skill — do NOT build
  these from scratch without reading it first.
---

# RAG Application Skill

Builds a full RAG application: an incremental indexing pipeline + a Gradio web UI
with a folder-path input for indexing and a chat window for Q&A.

## Architecture Overview

```
project/
├── 1_build_index.py      ← Index builder (run to ingest/update docs)
├── 2_app.py              ← Gradio UI (index panel + chat window)
├── requirements.txt
├── Dockerfile            ← Container image definition
├── docker-compose.yml    ← Orchestrates app + optional indexer service
├── .dockerignore
├── .env                  ← ANTHROPIC_API_KEY (never commit this)
├── my_docs/              ← Your documents (mounted as volume)
└── index_storage/        ← Created at runtime, persisted on disk
    ├── docstore.json
    ├── vector_store.json
    ├── index_store.json
    └── .index_manifest.json   ← MD5 manifest for incremental updates
```

**Stack**: LlamaIndex · Claude (Anthropic) · HuggingFace embeddings · Gradio · Docker

---

## Step 1 — Scaffold the project

```bash
mkdir my-rag-app && cd my-rag-app
```

---

## Step 2 — Write `requirements.txt`

See → `references/requirements.md` for the exact pinned dependencies.

---

## Step 3 — Write `1_build_index.py`

The indexer. See → `references/build_index.md` for the complete, annotated source.

Key design decisions baked in:
- **Incremental updates**: MD5 manifest (`index_storage/.index_manifest.json`) tracks every file. Re-running only processes new/changed files.
- **Stale chunk deletion**: When a file is modified, ALL its old chunks are deleted before re-inserting — prevents contradictory answers.
- **Rich metadata**: Every chunk gets `file_name`, `file_path`, `last_modified`, `indexed_at` — lets Claude reason about document versions.
- **Embedding model**: `BAAI/bge-small-en-v1.5` runs locally (no extra API key). Must match between indexer and app.
- **LLM**: `claude-sonnet-4-20250514` via `ANTHROPIC_API_KEY`.

CLI usage:
```bash
# First run or after adding new files
python 1_build_index.py --docs ./my_docs --index ./index_storage

# Force full rebuild
python 1_build_index.py --docs ./my_docs --index ./index_storage --rebuild
```

---

## Step 4 — Write `2_app.py`

The Gradio web UI. See → `references/app.md` for the complete, annotated source.

**UI layout** (two tabs):

### Tab 1 — Index Documents
```
┌─────────────────────────────────────────────┐
│  Documents Folder Path  [  ./my_docs      ] │
│  Index Storage Path     [ ./index_storage  ] │
│  [ 🔄 Rebuild from scratch ] checkbox        │
│  [ ▶ Run Indexer ] button                    │
│  ┌─────────────────────────────────────────┐ │
│  │  Indexing log output (scrollable)       │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Tab 2 — Chat
```
┌─────────────────────────────────────────────┐
│  Index Path  [ ./index_storage ]             │
│  Top-K       [ 3 ]  (slider 1-10)            │
│  [ ✅ Load Index ] button  → status label    │
│  ┌─────────────────────────────────────────┐ │
│  │  Chat history (Chatbot component)       │ │
│  └─────────────────────────────────────────┘ │
│  [ Type your question...       ] [ Send ]    │
│  [ 🗑 Clear Chat ]                           │
└─────────────────────────────────────────────┘
```

**Key implementation details**:
- The indexer is run via `subprocess.Popen` so stdout streams live into the log box.
- The index is loaded once per "Load Index" click and stored in `gr.State`.
- Chat history is a list of `[user, assistant]` pairs (Gradio Chatbot format).
- Source file names from chunk metadata are appended below each answer.

---

## Step 5 — Install & run (local Python)

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...

# Index your documents first
python 1_build_index.py --docs ./my_docs --index ./index_storage

# Launch the UI
python 2_app.py
# → opens http://localhost:7860
```

---

## Step 6 — Run with Docker (recommended for deployment)

See → `references/docker.md` for the complete `Dockerfile`, `docker-compose.yml`, and `.dockerignore`.

Key design decisions:
- **Stateless container**: `my_docs/` and `index_storage/` are host-mounted volumes — the container holds no data.
- **API key via `.env`**: `ANTHROPIC_API_KEY` is injected at runtime, never baked into the image.
- **Embedding model pre-downloaded**: baked into the image at build time so container startup is instant.
- **Two services**: `rag-app` (always-on UI) and `indexer` (one-shot, triggered on demand via `--profile indexer`).

Quick start:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
docker compose build                    # ~2 min first time (downloads embedding model)
docker compose run --rm indexer         # index your documents
docker compose up -d                    # launch UI → http://localhost:7860

# Adding new documents later:
cp new_file.pdf my_docs/
docker compose run --rm indexer         # incremental — only new files re-indexed
```

---

## Common Customisations

| Goal | Where to change |
|---|---|
| Different LLM (OpenAI, Ollama, etc.) | `configure_models()` in both files |
| Different embedding model | `Settings.embed_model` — must match in both files |
| Chunk size / overlap | `Settings.chunk_size` / `Settings.chunk_overlap` |
| Number of retrieved chunks | `--top-k` CLI arg or slider in UI |
| Custom system prompt for Q&A | Pass `text_qa_template` to `index.as_query_engine()` |
| Add source citation in answers | Already included via metadata — see `references/app.md` |
| Dark/light theme | Pass `theme=gr.themes.Soft()` to `gr.Blocks()` |
| Auth / password protect | `demo.launch(auth=("user", "pass"))` |

---

## Gotchas & Best Practices

1. **Embedding model must match** between `1_build_index.py` and `2_app.py`. If you change it, run `--rebuild`.
2. **Modified files**: the script deletes old chunks and re-inserts — safe. But if a file is *renamed*, the old chunks under the old name stay. Use `--rebuild` after renames.
3. **Related documents**: if doc B depends on doc A, consider indexing them together or adding a `group` metadata field to aid retrieval.
4. **Large document sets (>1000 files)**: switch to a persistent vector DB (Chroma, Qdrant, Weaviate) instead of the default in-memory store. See `references/vector_stores.md`.
5. **API key**: never hardcode. Always use `os.getenv("ANTHROPIC_API_KEY")`.
6. **Gradio version**: UI components differ between Gradio 3.x and 4.x. Requirements pin to 4.x.
7. **Docker volumes**: always mount `my_docs/` and `index_storage/` from the host — never copy docs into the image, or you'll need to rebuild every time you add a document.

---

## Reference files

- `references/requirements.md` — exact `requirements.txt` content
- `references/build_index.md` — complete `1_build_index.py` source + annotations
- `references/app.md` — complete `2_app.py` source + annotations
- `references/vector_stores.md` — swapping to Chroma / Qdrant for large-scale use
- `references/docker.md` — `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and usage guide
