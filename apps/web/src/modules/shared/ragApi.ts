export type DocumentStatus = 'processing' | 'ready' | 'failed'

export interface DocumentMetadata {
  id: string
  name: string
  status: DocumentStatus
  uploaded_at: string
  total_pages: number
}

export interface DocumentUploadResponse extends DocumentMetadata {}

export interface PageResponse {
  page_id: string
  document_id: string
  document_name: string
  page_number: number
  total_pages: number
  text: string
}

export interface QueryHit extends PageResponse {
  distance: number | null
}

export interface QueryResponse {
  query: string
  hits: Array<QueryHit>
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function apiFetchEmpty(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(path, init)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }
}

export function listDocuments(): Promise<Array<DocumentMetadata>> {
  return apiFetch<Array<DocumentMetadata>>('/api/documents/')
}

export function getDocument(documentId: string): Promise<DocumentMetadata> {
  return apiFetch<DocumentMetadata>(`/api/documents/${documentId}`)
}

export function getPage(documentId: string, pageNumber: number): Promise<PageResponse> {
  const params = new URLSearchParams({ page_number: String(pageNumber) })
  return apiFetch<PageResponse>(`/api/documents/${documentId}?${params.toString()}`)
}

export function getPageById(pageId: string): Promise<PageResponse> {
  return apiFetch<PageResponse>(`/api/pages/${pageId}`)
}

export function uploadDocument(file: File): Promise<DocumentUploadResponse> {
  const body = new FormData()
  body.append('file', file)

  return apiFetch<DocumentUploadResponse>('/api/documents', {
    method: 'POST',
    body,
  })
}

export function deleteDocument(documentId: string): Promise<void> {
  return apiFetchEmpty(`/api/documents/${documentId}`, {
    method: 'DELETE',
  })
}

export function searchDocuments(input: {
  query: string
  n_results: number
  document_id?: string
}): Promise<QueryResponse> {
  return apiFetch<QueryResponse>('/api/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}

export interface ChatResponse {
  query: string
  answer: string
  hits: Array<QueryHit>
}

export function askAgent(input: {
  query: string
  n_results: number
  document_id?: string
}): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/api/queries/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}

export async function listPages(): Promise<Array<PageResponse>> {
  const documents = await listDocuments()
  const readyDocuments = documents.filter((document) => document.status === 'ready')
  const pageRequests = readyDocuments.flatMap((document) =>
    Array.from({ length: document.total_pages }, (_, pageNumber) =>
      getPage(document.id, pageNumber),
    ),
  )

  return Promise.all(pageRequests)
}
