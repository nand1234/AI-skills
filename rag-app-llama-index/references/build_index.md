# 1_build_index.py — Complete Source

## Purpose
Ingest documents from a folder into a LlamaIndex VectorStoreIndex persisted on disk.
Supports incremental updates: only new or changed files are re-indexed.

## Complete source

```python
"""
1_build_index.py
────────────────
Reads every file inside a user-specified folder, builds a LlamaIndex
VectorStoreIndex, and persists it to disk so it can be reused later.

On subsequent runs it detects NEW or MODIFIED files and:
  - Deletes ALL old chunks from modified files before re-inserting
  - Attaches metadata (filename, last_modified, indexed_at) to every chunk
  - Only processes files that actually changed

Usage:
    python 1_build_index.py --docs ./my_docs --index ./my_index
    python 1_build_index.py --docs ./my_docs --index ./my_index --rebuild

Requirements:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-ant-...
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime

from llama_index.core import (
    SimpleDirectoryReader,
    VectorStoreIndex,
    StorageContext,
    load_index_from_storage,
    Settings,
)
from llama_index.llms.anthropic import Anthropic
from llama_index.embeddings.huggingface import HuggingFaceEmbedding


MANIFEST_FILENAME = ".index_manifest.json"


# ── model setup ───────────────────────────────────────────────────────────────

def configure_models() -> None:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit(
            "ERROR: ANTHROPIC_API_KEY is not set.\n"
            "Export it with:  export ANTHROPIC_API_KEY=sk-ant-..."
        )
    Settings.llm = Anthropic(
        model="claude-sonnet-4-20250514",
        api_key=api_key,
        max_tokens=2048,
    )
    # IMPORTANT: embedding model must match in both 1_build_index.py and 2_app.py
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
    Settings.chunk_size = 512
    Settings.chunk_overlap = 50


# ── manifest helpers ──────────────────────────────────────────────────────────

def manifest_path(index_dir: str) -> str:
    return os.path.join(index_dir, MANIFEST_FILENAME)

def load_manifest(index_dir: str) -> dict:
    """Return {filepath: md5} for all previously indexed files."""
    path = manifest_path(index_dir)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}

def save_manifest(index_dir: str, manifest: dict) -> None:
    with open(manifest_path(index_dir), "w") as f:
        json.dump(manifest, f, indent=2)

def file_md5(filepath: str) -> str:
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def scan_docs_dir(docs_dir: str) -> dict:
    """Return {filepath: md5} for every non-hidden file in docs_dir."""
    result = {}
    for root, _, files in os.walk(docs_dir):
        for name in files:
            if name.startswith("."):
                continue
            full = os.path.join(root, name)
            result[full] = file_md5(full)
    return result

def find_new_or_changed(current: dict, manifest: dict) -> list[str]:
    return [fp for fp, md5 in current.items() if manifest.get(fp) != md5]


# ── metadata helpers ──────────────────────────────────────────────────────────

def enrich_metadata(docs, filepath: str) -> None:
    """
    Attach useful metadata to every chunk so the LLM can reason about
    document versions and relationships when multiple files are retrieved.
    """
    last_modified = datetime.fromtimestamp(os.path.getmtime(filepath)).isoformat()
    indexed_at = datetime.utcnow().isoformat() + "Z"
    for doc in docs:
        doc.metadata.update({
            "file_path": filepath,
            "file_name": os.path.basename(filepath),
            "last_modified": last_modified,
            "indexed_at": indexed_at,
        })


# ── stale chunk removal ───────────────────────────────────────────────────────

def delete_stale_chunks(index: VectorStoreIndex, filepath: str) -> int:
    """
    Remove every node/chunk in the index that came from `filepath`.
    Critical for modified files — prevents contradictory answers from old+new chunks.
    """
    docstore = index.storage_context.docstore
    all_nodes = list(docstore.docs.values())
    target_name = os.path.basename(filepath)
    to_delete = []

    for node in all_nodes:
        meta = node.metadata or {}
        if meta.get("file_path") == filepath or meta.get("file_name") == target_name:
            to_delete.append(node.node_id)

    for node_id in to_delete:
        index.delete_nodes([node_id])

    if to_delete:
        print(f"    🗑️  Removed {len(to_delete)} stale chunk(s) from: {target_name}")
    return len(to_delete)


# ── index helpers ─────────────────────────────────────────────────────────────

def index_exists(index_dir: str) -> bool:
    return os.path.isfile(os.path.join(index_dir, "docstore.json"))

def load_existing_index(index_dir: str) -> VectorStoreIndex:
    print(f"📂  Loading existing index from: {index_dir}")
    storage_context = StorageContext.from_defaults(persist_dir=index_dir)
    return load_index_from_storage(storage_context)

def build_fresh_index(docs, index_dir: str) -> VectorStoreIndex:
    print("⚙️   Building new index from scratch …")
    storage_context = StorageContext.from_defaults()
    return VectorStoreIndex.from_documents(
        docs,
        storage_context=storage_context,
        show_progress=True,
    )

def load_file(filepath: str):
    reader = SimpleDirectoryReader(input_files=[filepath])
    return reader.load_data()


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build or incrementally update a LlamaIndex VectorStoreIndex."
    )
    parser.add_argument("--docs",    default="./docs",          help="Documents folder")
    parser.add_argument("--index",   default="./index_storage", help="Index storage folder")
    parser.add_argument("--rebuild", action="store_true",        help="Force full rebuild")
    args = parser.parse_args()

    if not os.path.isdir(args.docs):
        sys.exit(f"ERROR: Document directory not found: {args.docs}")

    os.makedirs(args.index, exist_ok=True)
    configure_models()

    current_files = scan_docs_dir(args.docs)
    if not current_files:
        sys.exit(f"ERROR: No documents found in {args.docs}")

    existing = index_exists(args.index) and not args.rebuild

    # ── First run / forced rebuild ────────────────────────────────────────────
    if not existing:
        print(f"📄  Found {len(current_files)} file(s). Building index from scratch …")
        all_docs = []
        for fp in current_files:
            docs = load_file(fp)
            enrich_metadata(docs, fp)
            all_docs.extend(docs)
        index = build_fresh_index(all_docs, args.index)
        new_manifest = current_files

    # ── Incremental update ────────────────────────────────────────────────────
    else:
        old_manifest = load_manifest(args.index)
        changed = find_new_or_changed(current_files, old_manifest)

        if not changed:
            print("✅  Index is already up to date — no new or changed files detected.")
            return

        print(f"🔍  Detected {len(changed)} new/changed file(s):")
        for fp in changed:
            status = "NEW" if fp not in old_manifest else "MODIFIED"
            print(f"    [{status}] {fp}")

        index = load_existing_index(args.index)

        for fp in changed:
            # Delete stale chunks first (only matters for MODIFIED files)
            if fp in old_manifest:
                delete_stale_chunks(index, fp)
            # Load, enrich, and insert
            docs = load_file(fp)
            enrich_metadata(docs, fp)
            print(f"    ➕ Inserting {len(docs)} chunk(s) from: {os.path.basename(fp)}")
            for doc in docs:
                index.insert(doc)

        new_manifest = {**old_manifest, **{fp: current_files[fp] for fp in changed}}

    # Persist index + updated manifest
    print(f"💾  Saving index to: {args.index}")
    index.storage_context.persist(persist_dir=args.index)
    save_manifest(args.index, new_manifest)
    print("🎉  Done! Index is up to date.")


if __name__ == "__main__":
    main()
```

## Key annotations

| Section | Why it matters |
|---|---|
| `MANIFEST_FILENAME` | Hidden JSON file storing `{filepath: md5}` — enables incremental updates |
| `enrich_metadata()` | Adds `file_name`, `last_modified`, `indexed_at` to every chunk — used by app for source citations and version reasoning |
| `delete_stale_chunks()` | Matches chunks by `file_path` or `file_name` metadata — MUST run before re-inserting a modified file |
| `configure_models()` | Sets global LlamaIndex settings — embedding model must match `2_app.py` |
| `--rebuild` flag | Bypasses manifest check, rebuilds everything — needed after renames or embedding model changes |
