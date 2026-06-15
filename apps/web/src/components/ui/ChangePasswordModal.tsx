import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'

interface ChangePasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordModal({ open, onOpenChange }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok')
      return
    }

    if (newPassword.length < 4) {
      setError('Password baru minimal harus 4 karakter')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal mengubah password')
        return
      }

      setSuccess(true)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        onOpenChange(false)
        setSuccess(false)
      }, 1500)
    } catch (err) {
      setError('Terjadi kesalahan koneksi')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    outline: 'none',
    color: 'var(--fg)',
    background: 'var(--input-bg)',
    marginTop: 4,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-card border">
        <DialogHeader className="flex flex-row items-center gap-2 border-b pb-4 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold font-heading text-fg">Ganti Password</DialogTitle>
            <p className="text-xs text-fg-muted">Ubah password akun Anda</p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)' }}>Password Lama</label>
            <input
              type="password"
              required
              style={inputStyle}
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              placeholder="Masukkan password lama"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)' }}>Password Baru</label>
            <input
              type="password"
              required
              style={inputStyle}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Masukkan password baru (min 4 karakter)"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)' }}>Konfirmasi Password Baru</label>
            <input
              type="password"
              required
              style={inputStyle}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#e03131', fontWeight: 500 }}>
              {error}
            </p>
          )}

          {success && (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#2b8a3e', fontWeight: 500 }}>
              ✓ Password berhasil diperbarui!
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              style={{
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                background: 'var(--bg)',
                color: 'var(--fg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || success}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
                border: 'none',
                borderRadius: 7,
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
