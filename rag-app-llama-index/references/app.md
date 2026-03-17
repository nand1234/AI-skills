# 2_app.py — Complete Source

## Purpose
Gradio web UI with two tabs:
1. **Index Documents** — enter a folder path, run `1_build_index.py` with live log streaming
2. **Chat** — load the index and ask questions, with source citations in replies

## Complete source

```python
"""
2_app.py
────────
Gradio web UI for the RAG application.

Tab 1 – Index Documents: point at a folder, click Run, watch logs stream live.
Tab 2 – Chat: load the index, ask questions, get answers with source citations.

Usage:
    python 2_app.py
    # → http://localhost:7860

Requirements:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-ant-...
"""

import os
import sys
import subprocess
import threading
import queue

import gradio as gr

from llama_index.core import (
    StorageContext,
    load_index_from_storage,
    Settings,
)
from llama_index.llms.anthropic import Anthropic
from llama_index.embeddings.huggingface import HuggingFaceEmbedding


# ── model setup ───────────────────────────────────────────────────────────────

def configure_models() -> bool:
    """Configure LlamaIndex global settings. Returns False if API key missing."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return False
    Settings.llm = Anthropic(
        model="claude-sonnet-4-20250514",
        api_key=api_key,
        max_tokens=2048,
    )
    # Must match the model used in 1_build_index.py
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
    Settings.chunk_size = 512
    Settings.chunk_overlap = 50
    return True


# ── Tab 1: Indexing ───────────────────────────────────────────────────────────

def run_indexer(docs_path: str, index_path: str, rebuild: bool):
    """
    Run 1_build_index.py as a subprocess and stream its stdout line by line.
    Uses a generator so Gradio can update the log box incrementally.
    """
    if not docs_path.strip():
        yield "❌  Please enter a documents folder path."
        return
    if not index_path.strip():
        yield "❌  Please enter an index storage path."
        return
    if not os.path.isdir(docs_path.strip()):
        yield f"❌  Folder not found: {docs_path}"
        return

    cmd = [
        sys.executable, "1_build_index.py",
        "--docs",  docs_path.strip(),
        "--index", index_path.strip(),
    ]
    if rebuild:
        cmd.append("--rebuild")

    yield f"▶  Running: {' '.join(cmd)}\n\n"

    # Stream stdout in real time
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    log = ""
    for line in process.stdout:
        log += line
        yield log  # Gradio re-renders the whole textbox each update

    process.wait()
    if process.returncode == 0:
        yield log + "\n✅  Indexing complete."
    else:
        yield log + f"\n❌  Process exited with code {process.returncode}."


# ── Tab 2: Chat ───────────────────────────────────────────────────────────────

def load_index(index_path: str):
    """Load the persisted index from disk. Returns (index | None, status_message)."""
    if not index_path.strip():
        return None, "❌  Please enter an index path."

    if not configure_models():
        return None, "❌  ANTHROPIC_API_KEY is not set."

    docstore_path = os.path.join(index_path.strip(), "docstore.json")
    if not os.path.isfile(docstore_path):
        return None, (
            f"❌  No index found at {index_path}.\n"
            "Run the indexer in the first tab first."
        )

    try:
        storage_context = StorageContext.from_defaults(persist_dir=index_path.strip())
        index = load_index_from_storage(storage_context)
        return index, f"✅  Index loaded from {index_path}"
    except Exception as e:
        return None, f"❌  Failed to load index: {e}"


def chat(user_message: str, history: list, index_state, top_k: int):
    """
    Query the loaded index and append the answer + source citations to history.
    history is a list of [user_text, assistant_text] pairs.
    """
    if not user_message.strip():
        return history, ""

    if index_state is None:
        history = history + [[user_message, "⚠️  No index loaded. Use the Index tab first."]]
        return history, ""

    try:
        query_engine = index_state.as_query_engine(
            similarity_top_k=int(top_k),
            streaming=False,
        )
        response = query_engine.query(user_message)
        answer = str(response)

        # Append source file names from chunk metadata
        sources = set()
        if hasattr(response, "source_nodes"):
            for node in response.source_nodes:
                fname = node.metadata.get("file_name") or node.metadata.get("file_path", "")
                if fname:
                    sources.add(os.path.basename(fname))

        if sources:
            answer += "\n\n📎 *Sources: " + ", ".join(sorted(sources)) + "*"

        history = history + [[user_message, answer]]
    except Exception as e:
        history = history + [[user_message, f"❌  Error: {e}"]]

    return history, ""


def clear_chat():
    return [], ""


# ── Gradio UI ─────────────────────────────────────────────────────────────────

def build_ui():
    with gr.Blocks(title="RAG Document Assistant", theme=gr.themes.Soft()) as demo:

        gr.Markdown("# 📚 RAG Document Assistant")
        gr.Markdown("Index your documents, then chat with them using Claude.")

        # Shared state: the loaded LlamaIndex index object
        index_state = gr.State(None)

        # ── Tab 1: Index ──────────────────────────────────────────────────────
        with gr.Tab("📁 Index Documents"):
            gr.Markdown("### Step 1 — Point to your documents and run the indexer")

            with gr.Row():
                docs_input = gr.Textbox(
                    label="Documents Folder Path",
                    placeholder="./my_docs",
                    scale=3,
                )
                index_input_1 = gr.Textbox(
                    label="Index Storage Path",
                    value="./index_storage",
                    scale=2,
                )

            rebuild_checkbox = gr.Checkbox(
                label="🔄 Rebuild from scratch (ignore existing index)",
                value=False,
            )

            run_btn = gr.Button("▶ Run Indexer", variant="primary")

            log_output = gr.Textbox(
                label="Indexing Log",
                lines=20,
                max_lines=40,
                interactive=False,
                show_copy_button=True,
            )

            run_btn.click(
                fn=run_indexer,
                inputs=[docs_input, index_input_1, rebuild_checkbox],
                outputs=log_output,
            )

        # ── Tab 2: Chat ───────────────────────────────────────────────────────
        with gr.Tab("💬 Chat"):
            gr.Markdown("### Step 2 — Load the index and start asking questions")

            with gr.Row():
                index_input_2 = gr.Textbox(
                    label="Index Storage Path",
                    value="./index_storage",
                    scale=3,
                )
                top_k_slider = gr.Slider(
                    minimum=1, maximum=10, value=3, step=1,
                    label="Top-K (chunks retrieved per query)",
                    scale=2,
                )

            with gr.Row():
                load_btn = gr.Button("✅ Load Index", variant="secondary")
                load_status = gr.Label(label="Status")

            chatbot = gr.Chatbot(
                label="Chat",
                height=420,
                show_copy_button=True,
                bubble_full_width=False,
            )

            with gr.Row():
                msg_input = gr.Textbox(
                    label="Your question",
                    placeholder="Ask anything about your documents…",
                    scale=5,
                )
                send_btn = gr.Button("Send", variant="primary", scale=1)

            clear_btn = gr.Button("🗑 Clear Chat", variant="stop", size="sm")

            # Load index → update state + status label
            load_btn.click(
                fn=load_index,
                inputs=[index_input_2],
                outputs=[index_state, load_status],
            )

            # Send message (button or Enter)
            send_btn.click(
                fn=chat,
                inputs=[msg_input, chatbot, index_state, top_k_slider],
                outputs=[chatbot, msg_input],
            )
            msg_input.submit(
                fn=chat,
                inputs=[msg_input, chatbot, index_state, top_k_slider],
                outputs=[chatbot, msg_input],
            )

            clear_btn.click(fn=clear_chat, outputs=[chatbot, msg_input])

    return demo


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    demo = build_ui()
    demo.launch(
        server_name="0.0.0.0",   # accessible on local network
        server_port=7860,
        share=False,              # set True to get a public gradio.live URL
    )
```

## Key annotations

| Section | Why it matters |
|---|---|
| `run_indexer()` | Generator function — yields updated log string after each stdout line; Gradio re-renders the textbox incrementally |
| `subprocess.Popen` with `bufsize=1` | Line-buffered so each print from the indexer appears immediately in the UI |
| `load_index()` | Returns `(index, status)` — index stored in `gr.State` so it persists across chat turns without reloading |
| `chat()` | Appends `[user, assistant]` pairs to history list; extracts `file_name` from chunk metadata for source citations |
| `index_state = gr.State(None)` | Gradio state is per-session — each browser tab gets its own loaded index |
| `msg_input.submit(...)` | Allows pressing Enter to send, in addition to the Send button |
| `demo.launch(share=False)` | Set `share=True` for a temporary public URL via Gradio's tunnel |
