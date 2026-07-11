import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

import { EmptyState, PageList, RagLayout } from '#/modules/shared/ui'
import { listenForDocumentsChanged } from '#/modules/shared/ui/UploadMenu'
import { listPages, type PageResponse } from '#/modules/shared/ragApi'

export const Route = createFileRoute('/documents/pages')({ component: PagesIndexPage })

function PagesIndexPage() {
  const [pages, setPages] = useState<Array<PageResponse>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPages = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setPages(await listPages())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load pages')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPages()
    return listenForDocumentsChanged(() => void loadPages())
  }, [loadPages])

  return (
    <RagLayout>
      <section>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-normal" style={{ color: 'var(--fg)' }}>Pages</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>{pages.length} OCR pages available</p>
        </div>

        {isLoading ? <StateBlock>Loading pages</StateBlock> : null}
        {error ? <StateBlock tone="error">{error}</StateBlock> : null}
        {!isLoading && !error && pages.length === 0 ? (
          <EmptyState
            title="No pages"
            body="Ready documents will appear here after OCR finishes."
          />
        ) : null}
        {!isLoading && !error && pages.length > 0 ? <PageList pages={pages} /> : null}
      </section>
    </RagLayout>
  )
}

function StateBlock({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'error'
}) {
  const styles = tone === 'error'
    ? { backgroundColor: 'rgba(235, 87, 87, 0.1)', borderColor: 'rgba(235, 87, 87, 0.2)', color: '#eb5757' }
    : { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', color: 'var(--fg-muted)' }

  return <div className="rounded-lg border p-6 text-sm" style={styles}>{children}</div>
}
