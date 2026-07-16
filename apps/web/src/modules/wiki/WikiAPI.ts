// WikiAPI.ts — API client for the LLM Wiki feature
// All requests go through the BFF server (/api/wiki/*) to avoid CORS.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WikiPage {
  id: string
  slug: string
  title: string
  category: 'summary' | 'concept' | 'entity' | 'synthesis'
  content: string
  source_note_ids: string[]
  tags: string[]
  backlinks: string[]
  created_at: string
  updated_at: string
}

export interface WikiGraphNode {
  id: string
  title: string
  category: WikiPage['category']
  connections: number
}

export interface WikiGraphEdge {
  source: string
  target: string
}

export interface WikiGraph {
  nodes: WikiGraphNode[]
  edges: WikiGraphEdge[]
}

export interface WikiIngestLog {
  id: string
  note_id: string
  note_title: string
  pages_created: number
  pages_updated: number
  status: 'success' | 'error' | 'partial'
  summary: string
  created_at: string
}

export interface WikiSearchResult {
  slug: string
  title: string
  category: WikiPage['category']
  excerpt: string
  score: number
}

export interface WikiLintResult {
  issues: string[]
  suggestions: string[]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function wikiApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `Wiki API request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function wikiApiFetchEmpty(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `Wiki API request failed with status ${response.status}`)
  }
}

// ─── API functions ────────────────────────────────────────────────────────────

/** Fetch all wiki pages (flat list) */
export function getWikiPages(): Promise<WikiPage[]> {
  return wikiApiFetch<WikiPage[]>('/wiki/pages')
}

/** Fetch a single wiki page by slug */
export function getWikiPage(slug: string): Promise<WikiPage> {
  return wikiApiFetch<WikiPage>(`/wiki/pages/${encodeURIComponent(slug)}`)
}

/** Fetch pages grouped by category */
export function getWikiIndex(): Promise<Record<string, WikiPage[]>> {
  return wikiApiFetch<Record<string, WikiPage[]>>('/wiki/index')
}

/** Fetch the wiki knowledge graph (nodes + edges) */
export function getWikiGraph(): Promise<WikiGraph> {
  return wikiApiFetch<WikiGraph>('/wiki/graph')
}

/** Fetch wiki ingest activity log */
export function getWikiLog(): Promise<WikiIngestLog[]> {
  return wikiApiFetch<WikiIngestLog[]>('/wiki/log')
}

/** Full-text + semantic search over wiki */
export function searchWiki(query: string): Promise<WikiSearchResult[]> {
  return wikiApiFetch<WikiSearchResult[]>(`/wiki/search?q=${encodeURIComponent(query)}`)
}

/** Ingest a note's content into the wiki (creates/updates pages) */
export function ingestNoteToWiki(
  noteId: string,
  noteTitle: string,
  noteContent: string,
): Promise<{ message: string }> {
  return wikiApiFetch<{ message: string }>('/wiki/ingest', {
    method: 'POST',
    body: JSON.stringify({ note_id: noteId, note_title: noteTitle, note_content: noteContent }),
  })
}

/** Update a wiki page's markdown content */
export function updateWikiPage(slug: string, content: string): Promise<WikiPage> {
  return wikiApiFetch<WikiPage>(`/wiki/pages/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
}

/** Delete a wiki page by slug */
export function deleteWikiPage(slug: string): Promise<void> {
  return wikiApiFetchEmpty(`/wiki/pages/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
}

/** Run wiki health-check / linter */
export function lintWiki(): Promise<WikiLintResult> {
  return wikiApiFetch<WikiLintResult>('/wiki/lint', { method: 'POST' })
}
