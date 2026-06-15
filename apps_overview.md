# Homebrew Notes App: System & Tech Stack Overview

A modern notes application powered by a rich-text block editor, team workspace capabilities, and an autonomous, agentic AI assistant.

---

## 🏗️ Architecture Overview

The codebase is structured as a monorepo containing two main subsystems:
1. **`apps/web` (Frontend & BFF Server)**: Handles the user interface, local database interactions, file parsing, and proxies requests.
2. **`apps/ai-agent` (AI Assistant Backend)**: Handles the agentic workflows, conversational memory, tool execution, and background worker tasks.

---

## 🛠️ Tech Stack Details

### 1. Web Application (`apps/web`)

| Layer | Technologies |
| :--- | :--- |
| **Framework & Build** | React 19, Vite 8, TypeScript 6 |
| **Routing** | TanStack Router (Fully type-safe route generation & navigation) |
| **Styling** | TailwindCSS 4, Vanilla CSS variables for theming |
| **Rich Text Editor** | TipTap v3 (Block-based WYSIWYG editor), ReactFlow (for diagrams) |
| **BFF Server (Backend)** | Node.js, `tsx` (TypeScript executor) |
| **Database & ORM** | SQLite (`better-sqlite3`), Drizzle ORM (Type-safe queries) |
| **Utilities** | Lucide React (Icons), `bcryptjs` (Password hashing), `mammoth` (Word docx parsing), `xlsx` (Excel sheet parsing), `marked` (Markdown compiler) |

### 2. AI Agent Backend (`apps/ai-agent`)

| Layer | Technologies |
| :--- | :--- |
| **Framework** | FastAPI (ASGI web app), Scalar (interactive API documentation) |
| **Runtime** | Python 3.13, managed by `uv` |
| **Agents SDK** | OpenAI Agents SDK (with `any-llm` model wrapping and `sqlalchemy` state integration) |
| **Background Tasks** | Celery 5.6, Redis 7.4 (as message broker) |
| **Database** | SQLite (`aiosqlite` for asynchronous database connections) |
| **Search & Crawl** | DuckDuckGo Search (`ddgs` library) for web search and page content extraction |

---

## 🌟 Feature List

### 1. Advanced Note Editing
* **TipTap Rich Editor**: WYSIWYG block editor with slash commands (`/` menu), bullet/numbered lists, and text highlights.
* **Diagram Blocks**: Insert diagrams and flowcharts visually (powered by ReactFlow).
* **Multi-Format Importing**: Parse and import content directly into the editor from `.docx`, `.xlsx`, `.md`, `.txt`, and `.json`.
* **Attachment Uploads**: Attach arbitrary files and photos directly inside the note blocks.

### 2. Note & Workspace Management
* **Scope Isolation**: Switch between **Individual Notes** and **Team Notes** (with team workspace integration).
* **Daily Logs**: Create and manage timestamped logs for today's tasks in a single click.
* **Organized Sidebar**: Automatically groups notes by date (Today, Yesterday, Older dates) and features custom width resizing.
* **Search System**: Fast keyword search across note titles and content directly in the sidebar.

### 3. Sharing & Privacy Controls
* **Lock with PIN**: Lock sensitive notes using a custom 4-digit PIN.
* **Public Web Sharing**: Generate secret share tokens to expose notes publicly.
* **Access Control**: Password or PIN protection can be toggled on public share links.

### 4. Interactive AI Chat Assistant (Right Panel)
* **Live Streaming Chat**: Streams text completions and thinking processes in real-time.
* **Auto-Growing Textbox**: Chat input expands vertically as you type (capped at `200px` with vertical scroll) and supports `Enter` (Submit) / `Shift+Enter` (Newline).
* **Collapsible Reasoning Panel**: Renders intermediate sub-agent thinking processes (the "reasoning" trace).
* **DuckDuckGo Web Tools**: The AI can perform web searches, extract web pages as markdown, and crawl domain links.
* **Interactive Tool Approvals**: AI actions (like editing notes via `write_notes`) display "Approve" / "Reject" controls to update live editor state.
* **Automatic Execution Hook**: Automatically approves `write_notes` edits if the user's prompt intent suggests it (e.g. *"Tolong ringkas..."*, *"Perbarui..."*), showing:
  `✓ Catatan diperbarui otomatis & disimpan ke database.`
* **Specialized Sub-Agents**: Delegates background tasks (like automatic summarization or keyword tagging) asynchronously to dedicated sub-agents:
  * **Summarizer Sub-Agent** (`summarize_expert`)
  * **Tagger Sub-Agent** (`tagger_expert`)

### 5. Access & User Management (Admin Only)
* **Registration Approvals**: Admin approval process for new public registrations.
* **User Management Dashboard**: Admins can invite new users, assign roles (`admin` or `viewer`), suspend/delete users, and reset user passwords.
* **Profile Settings**: All users can securely change their own passwords via a modal in the sidebar footer.
