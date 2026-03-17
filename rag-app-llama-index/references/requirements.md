# requirements.txt

Copy this exactly into `requirements.txt` in the project root.

```
# LlamaIndex core
llama-index==0.10.68
llama-index-llms-anthropic==0.3.5
llama-index-embeddings-huggingface==0.3.1

# Gradio UI
gradio==4.44.0

# Utilities (usually already present but pin for reproducibility)
torch==2.3.1          # needed by HuggingFace embeddings — CPU-only is fine
sentence-transformers==3.0.1
```

> **Note on torch**: If you're on a machine without a GPU and want a lighter install,
> replace `torch==2.3.1` with `torch==2.3.1+cpu` and add the PyTorch CPU index:
> ```
> --extra-index-url https://download.pytorch.org/whl/cpu
> torch==2.3.1+cpu
> ```
