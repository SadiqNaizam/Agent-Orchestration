# Agent Orchestration Studio

A full-stack demo for building and running **CrewAI + LiteLLM** agent orchestration payloads visually.

```
Frontend (React) ──→ GitHub Pages
Backend (FastAPI) ──→ Render
```

## Features

- **Visual builder** — define agents (name / role / goal / backstory / LLM), tasks, and execution flow
- **Sequential & Hierarchical** — pick your CrewAI process type
- **Live streaming logs** — real-time SSE stream from the backend, shown in a terminal-style viewer
- **JSON payload preview** — see the exact payload sent to the backend
- **LiteLLM-powered** — use OpenAI, Anthropic, Gemini, or local Ollama models

---

## Project Structure

```
.
├── backend/
│   ├── main.py           # FastAPI app + SSE streaming
│   ├── models.py         # Pydantic payload models
│   ├── orchestrator.py   # CrewAI execution + log capture
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── AgentBuilder.jsx
│   │       ├── TaskBuilder.jsx
│   │       ├── FlowBuilder.jsx
│   │       ├── LogViewer.jsx
│   │       ├── PayloadPreview.jsx
│   │       └── SettingsPanel.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .github/
│   └── workflows/
│       └── deploy-frontend.yml   # Auto-deploy to GitHub Pages on push
├── render.yaml                   # Render deployment config
└── README.md
```

---

## Local Development

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Set your API key
export OPENAI_API_KEY=sk-...

uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — set Backend URL to `http://localhost:8000` in Settings.

---

## Deployment

### 1 — Deploy Backend to Render

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo.
3. Render will auto-detect `render.yaml`.  
   Or manually set:
   - **Build command**: `pip install -r backend/requirements.txt`
   - **Start command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. In **Environment Variables** on Render, set:
   - `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`
5. Note your Render URL, e.g. `https://agent-orchestration-backend.onrender.com`

### 2 — Deploy Frontend to GitHub Pages

1. In your GitHub repo → **Settings → Pages** → Source: **Deploy from a branch** → `gh-pages`.
2. In **Settings → Secrets and variables → Actions**, add:
   - `VITE_API_URL` = your Render backend URL (no trailing slash)
3. Push any change to `frontend/` on `main` to trigger the deploy workflow.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`

---

## Payload Schema

```json
{
  "agents": [
    {
      "id": "agent-1",
      "name": "Researcher",
      "role": "Senior Research Analyst",
      "goal": "Find cutting-edge info on the topic",
      "backstory": "10+ years of research experience",
      "llm": "openai/gpt-4o-mini"
    }
  ],
  "tasks": [
    {
      "id": "task-1",
      "description": "Research the latest trends in AI agents",
      "expected_output": "A detailed report with 5+ trends",
      "agent_id": "agent-1"
    }
  ],
  "flow": {
    "process": "sequential",
    "manager_llm": "openai/gpt-4o-mini"
  },
  "api_key": "sk-...",
  "api_key_type": "openai"
}
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/orchestrate` | Submit payload → returns `{ job_id }` |
| `GET` | `/api/stream/{job_id}` | SSE log stream for a job |

---

## Supported LLM Models (via LiteLLM)

| Label | Model string |
|-------|-------------|
| GPT-4o Mini | `openai/gpt-4o-mini` |
| GPT-4o | `openai/gpt-4o` |
| Claude 3.5 Sonnet | `anthropic/claude-3-5-sonnet-20241022` |
| Claude 3 Haiku | `anthropic/claude-3-haiku-20240307` |
| Gemini 1.5 Pro | `gemini/gemini-1.5-pro` |
| Ollama Llama3 (local) | `ollama/llama3` |
