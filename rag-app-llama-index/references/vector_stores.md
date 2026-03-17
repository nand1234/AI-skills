# Swapping to a Persistent Vector Store

The default LlamaIndex setup uses a simple JSON-file vector store (`vector_store.json`).
This works well for up to ~500–1000 documents. For larger collections, swap to a
dedicated vector database.

---

## Option A — Chroma (easiest, local)

```bash
pip install llama-index-vector-stores-chroma chromadb
```

### In `1_build_index.py` — replace `build_fresh_index()`:

```python
import chromadb
from llama_index.vector_stores.chroma import ChromaVectorStore

def build_fresh_index(docs, index_dir: str) -> VectorStoreIndex:
    chroma_client = chromadb.PersistentClient(path=index_dir)
    chroma_collection = chroma_client.get_or_create_collection("documents")
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    return VectorStoreIndex.from_documents(
        docs,
        storage_context=storage_context,
        show_progress=True,
    )
```

### In `2_app.py` — replace `load_index()` body:

```python
import chromadb
from llama_index.vector_stores.chroma import ChromaVectorStore

chroma_client = chromadb.PersistentClient(path=index_path.strip())
chroma_collection = chroma_client.get_or_create_collection("documents")
vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)
```

---

## Option B — Qdrant (production-grade, supports filtering)

```bash
pip install llama-index-vector-stores-qdrant qdrant-client
# Start Qdrant: docker run -p 6333:6333 qdrant/qdrant
```

```python
from qdrant_client import QdrantClient
from llama_index.vector_stores.qdrant import QdrantVectorStore

client = QdrantClient(host="localhost", port=6333)
vector_store = QdrantVectorStore(client=client, collection_name="documents")
storage_context = StorageContext.from_defaults(vector_store=vector_store)
```

---

## When to upgrade

| Scenario | Recommendation |
|---|---|
| < 500 documents | Default JSON store (no change needed) |
| 500–10k documents | Chroma (local, no infra required) |
| > 10k documents or multi-user | Qdrant or Weaviate (dedicated server) |
| Cloud deployment | Pinecone or Weaviate Cloud |
