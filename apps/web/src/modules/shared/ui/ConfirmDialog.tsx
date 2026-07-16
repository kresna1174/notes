import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent showCloseButton={false} style={{ maxWidth: 380 }}>
        <DialogHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'rgba(224,49,49,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <AlertTriangle size={18} color="#e03131" />
            </div>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem' }}>
              {title}
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter style={{ marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', fontSize: '0.8rem', fontWeight: 500,
              border: '1px solid var(--border)', borderRadius: 7,
              background: 'var(--bg)', color: 'var(--fg-muted)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); onCancel() }}
            style={{
              padding: '7px 16px', fontSize: '0.8rem', fontWeight: 600,
              border: 'none', borderRadius: 7,
              background: '#e03131', color: '#fff',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c92a2a' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#e03131' }}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
