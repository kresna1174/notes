# 🧠 Mindspace

**Mindspace** is a modern, AI-powered workspace for your thoughts. Built on a rich block editor, team collaboration features, and an agentic AI assistant — it bridges standard note-taking with deep AI-assisted editing, document intelligence, and real-time web retrieval.

> **Live Demo:** [notes.zerohero.my.id](https://notes.zerohero.my.id)

---

## 📸 Preview

### Login Page

![Mindspace Login Page](assets/login_page.png)

---

## 🏗️ Architecture Overview

The system is a modern decoupled web app split into two main subsystems:

1. **Frontend & BFF Server (`apps/web`)**: A React 19 app powered by TanStack Router and TailwindCSS 4, with a Node.js BFF (Backend For Frontend) for database operations and file parsing.
2. **AI Agent Backend (`apps/ai-agent`)**: A FastAPI Python application orchestrating agentic workflows, conversational memory, tool integration, and Celery-driven background agents.

### 🖥️ Layer 1: Web Workspace (`apps/web`)
* **Client-Side Interface**: React 19 SPA built with Vite 8 and fully type-safe routing via TanStack Router.
* **BFF (Backend-For-Frontend)**: A Node.js API server running via `tsx`, using **Drizzle ORM** with **SQLite** (`web.db`) for local note state.
* **Real-time Collaboration**: Yjs-powered CRDT sync for live multi-user editing via WebSocket.
* **Document Parsers**: Local handlers to extract text from uploads (`.docx`, `.xlsx`, `.md`, `.txt`, `.json`).

### ⚡ Layer 2: AI Agent Workspace (`apps/ai-agent`)
* **FastAPI Web Service**: Core Python 3.13 API managing live conversational sessions and agent configurations.
* **OpenAI Agents Engine**: Orchestrates active agents, session databases, and streaming completions.
* **Celery Background Workers**: Offloads intensive tasks (document summarization, metadata tagging) asynchronously via a **Redis** message queue.
* **Agent Database**: An SQLite database (`sessions.db`) managed via `aiosqlite` / SQLAlchemy to persist session logs and memory.

---

### 🔄 Request & Communication Flow
1. **User Interaction**: The browser communicates with the BFF server via HTTP and WebSocket.
2. **Local CRUD Operations**: Notes, attachments, and documents are stored in the main `web.db` SQLite database.
3. **AI Chat Requests**: Chat inputs are proxied by the BFF to the FastAPI backend with streaming responses.
4. **Agent Prompts**: The FastAPI server communicates with **OpenRouter** (configurable LLM) to generate reasoning and answers.
5. **Background Task Offloading**: Long-running tasks (summarization, web crawling) are dispatched as Celery tasks through a **Redis** broker.

---

## 🛠️ Tech Stack

### Web Workspace (`apps/web`)
| Layer | Technology |
| :--- | :--- |
| Frontend Framework | React 19 + Vite 8 + TypeScript 6 |
| Routing | TanStack Router (fully type-safe) |
| Styling | TailwindCSS 4 + CSS variables (full dark mode) |
| Text Editor | TipTap v3 (block-based rich WYSIWYG) |
| Diagram Editor | ReactFlow (inline flowchart blocks) |
| Real-time Sync | Yjs CRDT + WebSocket (y-websocket) |
| BFF Runtime | Node.js + Drizzle ORM + SQLite (`better-sqlite3`) |
| File Parsers | `mammoth` (.docx), `xlsx` (.xlsx), `marked` (.md) |

### AI Agent Workspace (`apps/ai-agent`)
| Layer | Technology |
| :--- | :--- |
| Framework | FastAPI (ASGI) + Scalar API docs |
| Runtime | Python 3.13 (managed via `uv`) |
| Agent Engine | OpenAI Agents SDK |
| Task Queues | Celery 5.6 + Redis 7.4 |
| Agent Database | SQLite (`aiosqlite` async access) |
| Web Tools | DuckDuckGo Search + URL markdown extractor |

---

## 🌟 Key Features

### 1. Advanced Note Editing
* **TipTap Block Editor**: Full-featured WYSIWYG editor with `/` slash commands, code blocks with syntax highlighting, callouts, and text highlighters.
* **Visual Diagrams**: Insert, render, and edit flowcharts visually inside notes using **ReactFlow**.
* **Universal Importer**: Directly parse and import `.docx`, `.xlsx`, `.md`, `.txt`, and `.json` files into the block editor.
* **Rich Attachments**: Upload and manage arbitrary files and images nested within individual note blocks.
* **AI Draft**: Generate and refine text inline using an AI draft block — with live streaming, reasoning display, and accept/reject controls.
* **Version History**: Browse and restore previous snapshots of any note.

### 2. Note & Workspace Management
* **Workspace Isolation**: Toggle seamlessly between **Personal** notes and shared **Team/Organization** notes.
* **Hierarchical Notes**: Drag-and-drop tree structure with collapsible parent/child pages.
* **Dynamic Sidebar**: Auto-organizes notes chronologically (Today, Yesterday, Older) with real-time fuzzy search.
* **Daily Logs**: Date-stamped developer journals created in one click.

### 3. Sharing & Privacy
* **Note Lock**: Protect sensitive notes behind a custom 4-digit PIN.
* **Public Web Sharing**: Generate access tokens to share notes publicly.
* **Link Access Controls**: Optional password or PIN credentials for public share links.
* **Export**: Export notes to PDF.

### 4. Interactive AI Chat Assistant
* **Floating Chat Panel**: Elegant floating chat sidebar that streams completions in real time.
* **Collapsible Reasoning Logs**: Step-by-step chain-of-thought thinking displayed inline, collapsed by default.
* **Tool Call Transparency**: Inspect every tool invocation the AI performs, collapsed for clean reading.
* **Action Approvals**: AI write-actions require explicit user approval before modifying live notes.
* **Fullscreen Mode**: Expand to a large focused modal for deep research sessions.
* **RAG Chat**: Context-aware chat grounded in your uploaded documents.
* **Background Sub-Agents via Celery**:
  * `summarize_expert` — Compiles long notes into bullet summaries.
  * `tagger_expert` — Suggests relevant tags from document content.
* **Web Search Tools**: Integrated DuckDuckGo search, URL crawling, and markdown content extraction.

### 5. Access & User Management (Admin Dashboard)
* **Registration Queue**: Admins approve or reject new signup requests.
* **Admin Board**: Invite members, assign roles (`admin`/`viewer`), suspend accounts, reset passwords, and reset PINs.
* **Profile Manager**: Users update credentials securely from their profile modal.
* **Changelog / Release Notes**: In-app changelog modal accessible from the login page.

### 6. Wiki & Document Intelligence (RAG Engine)
* **Wiki Viewer**: Structured, browsable wiki-style document viewer.
* **RAG Document Indexing**: Upload PDFs for semantic chunking, OCR, and vector indexing.
* **Context-Aware AI Chat**: Ask questions grounded in your indexed documents with citations.

---

## 🚀 Installation & Setup

### Option 1: Docker Compose (Recommended)
Spins up Redis, the web app, FastAPI agents, and Celery workers automatically.

```bash
# 1. Clone and enter the project
git clone <repository-url>
cd notes-app

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in your OPENROUTER_API_KEY

# 3. Start all services
docker-compose up -d --build
```

| Service | URL |
| :--- | :--- |
| Web UI | `http://localhost:3000` |
| AI Agent API Docs | `http://localhost:8000/docs` |

---

### Option 2: Manual Development Setup

#### Prerequisites
* **Node.js** v18+
* **Python** v3.13+
* **uv** (fast Python package manager)
* **Redis** running on port `6379`

```bash
# 1. Configure environment
cp .env.example .env

# 2. Install all dependencies (Node + Python)
npm run monorepo:install

# 3. Start Redis (macOS Homebrew example)
brew services start redis

# 4. Start Celery workers (in a separate terminal)
npm run ai:celery

# 5. Start all dev servers concurrently
npm run dev:all
# → Web:    http://localhost:3000
# → AI API: http://localhost:8000
```

---

## ⚙️ Environment Variables

| Key | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | OpenRouter authentication key | — | **Yes** |
| `OPENROUTER_MODEL` | LLM model for streaming responses | `google/gemini-2.5-flash:free` | No |
| `OPENROUTER_BASE_URL` | OpenRouter base API URL | `https://openrouter.ai/api/v1` | No |

---

## 🖥️ Commands Reference

All commands run from the project root:

| Command | Description |
| :--- | :--- |
| `npm run monorepo:install` | Install Node modules + Python environments |
| `npm run dev:all` | Launch React + FastAPI concurrently |
| `npm run dev` | Run the web client only |
| `npm run ai:dev` | Run the FastAPI backend only |
| `npm run ai:celery` | Start Celery background workers |
| `npm run build` | Build the web app for production |
| `npm run test` | Run frontend unit tests |

---

## 📄 License

This project is licensed under the **MIT License**.
