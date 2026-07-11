import { Link } from '@tanstack/react-router'
import { FileText, Search, Trash2 } from 'lucide-react'

import type { DocumentMetadata, DocumentStatus, PageResponse, QueryHit } from '../ragApi'

const statusStyleMap: Record<DocumentStatus, { bg: string; fg: string; border: string }> = {
  processing: { bg: 'rgba(240, 140, 0, 0.1)', fg: '#f08c00', border: 'rgba(240, 140, 0, 0.2)' },
  ready: { bg: 'rgba(35, 131, 226, 0.1)', fg: 'var(--primary)', border: 'rgba(35, 131, 226, 0.2)' },
  failed: { bg: 'rgba(235, 87, 87, 0.1)', fg: '#eb5757', border: 'rgba(235, 87, 87, 0.2)' },
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const styles = statusStyleMap[status] || statusStyleMap.processing
  return (
    <span
      className="inline-flex h-6 items-center rounded-full px-2 text-xs font-medium border"
      style={{ backgroundColor: styles.bg, color: styles.fg, borderColor: styles.border }}
    >
      {status}
    </span>
  )
}

export function EmptyState({
  icon = 'document',
  title,
  body,
}: {
  icon?: 'document' | 'search'
  title: string
  body: string
}) {
  const Icon = icon === 'search' ? Search : FileText

  return (
    <div
      className="grid min-h-64 place-items-center rounded-lg border border-dashed px-6 text-center"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}
    >
      <div>
        <Icon className="mx-auto" size={28} style={{ color: 'var(--fg-subtle)' }} aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold" style={{ color: 'var(--fg)' }}>{title}</p>
        <p className="mt-1 max-w-sm text-sm" style={{ color: 'var(--fg-muted)' }}>{body}</p>
      </div>
    </div>
  )
}

export function DocumentsTable({
  documents,
  deletingDocumentId,
  onDelete,
}: {
  documents: Array<DocumentMetadata>
  deletingDocumentId?: string | null
  onDelete?: (document: DocumentMetadata) => void
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}
    >
      <table className="w-full border-collapse text-left text-sm">
        <thead
          className="text-xs uppercase tracking-wide"
          style={{ backgroundColor: 'var(--table-header-bg)', color: 'var(--fg-muted)', borderBottom: '1px solid var(--border)' }}
        >
          <tr>
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Pages</th>
            <th className="px-4 py-3 font-semibold">Uploaded</th>
            {onDelete ? <th className="w-14 px-4 py-3 font-semibold">Delete</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
          {documents.map((document) => (
            <tr
              key={document.id}
              className="transition hover:opacity-95"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <td className="px-4 py-3">
                <Link
                  to="/documents/$documentId"
                  params={{ documentId: document.id }}
                  className="font-medium hover:opacity-80"
                  style={{ color: 'var(--fg)' }}
                >
                  {document.name}
                </Link>
                <p className="mt-1 text-xs" style={{ color: 'var(--fg-subtle)' }}>{document.id}</p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={document.status} />
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--fg-muted)' }}>{document.total_pages}</td>
              <td className="px-4 py-3" style={{ color: 'var(--fg-subtle)' }}>{formatDate(document.uploaded_at)}</td>
              {onDelete ? (
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-md transition hover:bg-rose-50/20 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ color: 'var(--fg-muted)' }}
                    onClick={() => onDelete(document)}
                    disabled={deletingDocumentId === document.id}
                    aria-label={`Delete ${document.name}`}
                    title="Delete document"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PageList({ pages }: { pages: Array<PageResponse | QueryHit> }) {
  return (
    <div className="grid gap-3">
      {pages.map((page) => (
        <Link
          key={page.page_id}
          to="/pages/$pageId"
          params={{ pageId: page.page_id }}
          className="rounded-lg border p-4 transition hover:shadow-sm"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--fg)' }}>{page.document_name}</span>
            <span>Page {page.page_number + 1}</span>
            <span>{page.total_pages} total</span>
            {'distance' in page && page.distance !== null ? (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                style={{ backgroundColor: 'var(--input-bg)', color: 'var(--fg-muted)', borderColor: 'var(--border)' }}
              >
                {page.distance.toFixed(4)}
              </span>
            ) : null}
          </div>
          <p className="mt-3 line-clamp-3 text-sm leading-6" style={{ color: 'var(--fg)' }}>{page.text}</p>
        </Link>
      ))}
    </div>
  )
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
