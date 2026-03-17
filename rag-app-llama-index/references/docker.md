# Docker & Docker Compose

Run the RAG app as a container. Documents and the index are mounted as volumes
so they persist outside the container and can be updated without rebuilding the image.

---

## File layout (add these to the project root)

```
project/
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env                  ← create this locally, never commit it
├── 1_build_index.py
├── 2_app.py
├── requirements.txt
├── my_docs/              ← mounted into container at /app/docs
└── index_storage/        ← mounted into container at /app/index_storage
```

---

## `Dockerfile`

```dockerfile
# ── Base image ────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# Keeps Python from buffering stdout/stderr (important for live log streaming)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # HuggingFace model cache — baked into image on first build
    HF_HOME=/app/.cache/huggingface \
    # Gradio listens on all interfaces inside the container
    GRADIO_SERVER_NAME=0.0.0.0 \
    GRADIO_SERVER_PORT=7860

WORKDIR /app

# Install system deps (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer-cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the embedding model so first run doesn't need internet
RUN python -c "from llama_index.embeddings.huggingface import HuggingFaceEmbedding; \
               HuggingFaceEmbedding(model_name='BAAI/bge-small-en-v1.5')"

# Copy application code
COPY 1_build_index.py 2_app.py ./

# Docs and index_storage are injected at runtime via volumes (see docker-compose.yml)
# Create mount points so Docker doesn't create them as root-owned dirs
RUN mkdir -p /app/docs /app/index_storage

EXPOSE 7860

CMD ["python", "2_app.py"]
```

---

## `docker-compose.yml`

```yaml
version: "3.9"

services:
  rag-app:
    build: .
    container_name: rag-app
    restart: unless-stopped

    ports:
      - "7860:7860"       # Gradio UI → http://localhost:7860

    environment:
      # Read from .env file (never hardcode the key here)
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

    volumes:
      # Your documents folder — edit the left side to point at your local path
      - ./my_docs:/app/docs
      # Index persists on the host so rebuilds don't lose it
      - ./index_storage:/app/index_storage

    # Optional: limit resources on shared machines
    # deploy:
    #   resources:
    #     limits:
    #       memory: 4g

  # Optional one-shot indexer service — run with: docker compose run indexer
  indexer:
    build: .
    container_name: rag-indexer
    profiles: ["indexer"]      # not started by default; use --profile indexer

    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

    volumes:
      - ./my_docs:/app/docs
      - ./index_storage:/app/index_storage

    # Override the default CMD to run the indexer instead of the UI
    command: >
      python 1_build_index.py
        --docs /app/docs
        --index /app/index_storage
```

---

## `.dockerignore`

```
__pycache__/
*.pyc
*.pyo
.env
.git/
.gitignore
index_storage/
*.skill
README.md
```

---

## `.env` (create locally, never commit)

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Add `.env` to your `.gitignore`:
```bash
echo ".env" >> .gitignore
```

---

## Usage

### First time setup

```bash
# 1. Create your .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 2. Create your docs folder and drop documents in
mkdir my_docs
cp /path/to/your/docs/* my_docs/

# 3. Build the image (downloads embedding model — takes ~2 min first time)
docker compose build

# 4. Index your documents
docker compose run --rm indexer

# 5. Launch the UI
docker compose up -d

# → http://localhost:7860
```

### Day-to-day: adding new documents

```bash
# Drop new files into my_docs/, then:
docker compose run --rm indexer
# Only new/changed files are re-indexed (incremental update)
```

### Force full rebuild of the index

```bash
docker compose run --rm indexer python 1_build_index.py \
  --docs /app/docs --index /app/index_storage --rebuild
```

### View logs

```bash
docker compose logs -f rag-app
```

### Stop / restart

```bash
docker compose down
docker compose up -d
```

---

## Important notes

| Topic | Detail |
|---|---|
| **API key security** | Always passed via `.env` → `environment:` — never baked into the image |
| **Volume mounts** | `my_docs/` and `index_storage/` live on the host; the container is stateless |
| **Embedding model cache** | Baked into the image at build time (`HF_HOME=/app/.cache/huggingface`) so the container starts fast |
| **Port** | Gradio runs on `7860` inside and outside the container — change the left side of `"7860:7860"` to use a different host port |
| **Rebuilding the image** | Only needed when `requirements.txt` or `Dockerfile` changes, not when docs change |
| **CPU vs GPU** | The default image is CPU-only. For GPU support, change base image to `pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime` and add `deploy.resources.reservations.devices` in docker-compose |
