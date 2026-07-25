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
      <DialogContent
        showCloseButton={false}
        style={{
          maxWidth: 380,
          background: 'var(--card-bg)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <DialogHeader style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'rgba(224,49,49,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <AlertTriangle size={18} color="#e03131" />
            </div>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--fg)' }}>
              {title}
            </DialogTitle>
          </div>
        </DialogHeader>
        <DialogDescription style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--fg-muted)', marginBottom: 20 }}>
          {description}
        </DialogDescription>
        <DialogFooter>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', fontSize: '0.8rem', fontWeight: 500,
              border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 7,
              background: 'var(--bg)', color: 'var(--fg-muted)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
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
              transition: 'opacity 0.15s',
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
