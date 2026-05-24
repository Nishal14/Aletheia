# Aletheia

**Epistemic reasoning assistant with claim-level verification, uncertainty estimation, and self-enriching RAG.**

Aletheia goes beyond generating fluent responses — it retrieves evidence, extracts factual claims, scores each claim against retrieved knowledge, and surfaces confidence metrics directly in the UI. Every response runs through a multi-stage pipeline that shows its work: grounding score, hallucination risk, evidence coverage, and per-claim verdicts.

The system self-enriches: when it lacks knowledge to answer a question, it automatically queries arXiv or Wikipedia, ingests the result into its vector store, and re-retrieves before generating. The knowledge base grows with every conversation.

---

## Features

- **Streaming chat** with real-time token delivery and visible pipeline stages
- **Retrieval-Augmented Generation** via Qdrant semantic search
- **Hybrid retrieval** — semantic + keyword fallback for named-entity queries (e.g. paper titles)
- **Claim extraction** using regex heuristics on every response
- **Cosine-grounded verification** — claims scored against retrieved evidence chunks
- **Verbalized confidence** (LM-Polygraph black-box method) — model rates its own certainty
- **Self-enriching knowledge base** — auto-fetches from arXiv and Wikipedia when retrieval is poor
- **Knowledge panel** in sidebar — ingest arXiv papers or Wikipedia articles by keyword
- **Persistent memory** — past exchanges summarised and stored in Qdrant for semantic recall
- **Conversation sessions** with edit, resend, and regenerate on any message
- **Research mode** — deeper analysis prompt for complex queries

## Pipeline

```
User Query
  → Retrieve (Qdrant semantic + keyword)
  → Auto-Enrich (arXiv / Wikipedia if poor retrieval)
  → Generate (streaming, qwen3:4b via Ollama)
  → Extract Claims (regex)
  → Score Claims (cosine similarity vs evidence)
  → Verbalized Confidence (LM-Polygraph)
  → Epistemic Metadata (confidence, grounding, hallucination risk)
  → UI Annotation (evidence panel, claim list, confidence gauge)
```

## Inspiration

The pipeline architecture is informed by MBZUAI research:

| Component | Paper |
|---|---|
| Claim decomposition + NLI | [Loki](https://arxiv.org/abs/2410.01794) — Li, Wang, Nakov, Baldwin (EMNLP 2024) |
| Verbalized confidence | [LM-Polygraph](https://arxiv.org/abs/2311.07383) — Shelmanov, Panov, Nakov, Baldwin (EMNLP 2023) |
| Selective retrieval | [FIRE](https://arxiv.org/abs/2411.00784) — Xie, Wang, Nakov (NAACL 2025) |
| Factuality evaluation | [OpenFactCheck](https://arxiv.org/abs/2408.11832) — Geng, Wang, Nakov (EMNLP 2024) |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, Tailwind CSS, Framer Motion, 21st.dev components |
| Backend | FastAPI, SQLAlchemy (SQLite), Python 3.11+ |
| Vector DB | Qdrant |
| Inference | Ollama — `qwen3:4b` (primary), `nomic-embed-text` (embeddings) |
| External data | arXiv API, Wikipedia API |

**Hardware target:** RTX 3050 4GB VRAM, 16GB RAM

---

## Quick Start

### Prerequisites

- [Python 3.11+](https://python.org)
- [Node.js 18+](https://nodejs.org)
- [Ollama](https://ollama.ai)
- [Docker](https://docker.com) (for Qdrant — optional, chat works without it)

### 1. Install dependencies

```powershell
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Pull models

```bash
ollama pull qwen3:4b
ollama pull nomic-embed-text
```

### 3. Start Qdrant (optional but recommended)

```bash
docker compose up qdrant -d
```

### 4. Configure backend

```bash
cp backend/.env.example backend/.env
```

### 5. Run

**Backend** (from `backend/`):
```bash
python -m uvicorn app.main:app --port 8000
```

**Frontend** (from `frontend/`):
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
aletheia/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routes (chat WS, sessions, documents, knowledge)
│   │   ├── core/         # Pipeline logic (orchestrator, retrieval, verification, confidence)
│   │   ├── models/       # Pydantic + SQLAlchemy models
│   │   └── services/     # Ollama, Qdrant, knowledge fetchers
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/          # Next.js app router
│       ├── components/   # Chat, epistemic panels, sidebar, layout
│       ├── hooks/        # useChat, useEpistemic, useKnowledgeStats
│       ├── lib/          # API client, utilities
│       └── types/        # TypeScript types
├── docker-compose.yml
├── setup.ps1             # First-time setup (Windows)
└── start.ps1             # Launch all services (Windows)
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `PRIMARY_MODEL` | `qwen3:4b` | Chat model |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model |
| `QDRANT_HOST` | `localhost` | Qdrant host |
| `QDRANT_PORT` | `6333` | Qdrant port |
| `TOP_K_CHUNKS` | `5` | Retrieval top-K |

---

## License

MIT — see [LICENSE](LICENSE).
