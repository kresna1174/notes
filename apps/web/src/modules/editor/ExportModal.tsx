import React, { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../shared/ui'
import { Download, FileText, Settings, Type, AlignLeft, Palette, CheckSquare, X, Eye } from 'lucide-react'
import { docToSegments, DocContent } from './DocRenderer'
import { jsonToMarkdown } from './markdown'

interface ExportModalProps {
  note: {
    id: string
    title: string
    content: string
    createdAt: number
    updatedAt: number
    createdByUsername?: string | null
    coverImage?: string | null
    icon?: string | null
  }
  onClose: () => void
}

type ExportFormat = 'pdf' | 'md'
type PdfTheme = 'light' | 'sepia' | 'slate' | 'classic'
type PdfFont = 'sans' | 'serif' | 'mono'
type PdfMargin = 'narrow' | 'standard' | 'wide'

export function ExportModal({ note, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const previewRef = useRef<HTMLDivElement>(null)
  
  // PDF configurations
  const [pdfTheme, setPdfTheme] = useState<PdfTheme>('light')
  const [pdfFont, setPdfFont] = useState<PdfFont>('sans')
  const [pdfMargin, setPdfMargin] = useState<PdfMargin>('standard')
  const [includeCover, setIncludeCover] = useState(true)
  const [includeMetadata, setIncludeMetadata] = useState(true)

  // Segment conversion for preview
  const segments = React.useMemo(() => {
    try {
      const doc = JSON.parse(note.content)
      return docToSegments(doc, '')
    } catch {
      return []
    }
  }, [note.content])

  // Get style variables based on config
  const getThemeStyles = (theme: PdfTheme) => {
    switch (theme) {
      case 'sepia':
        return {
          bg: '#fcf8f2',
          fg: '#433422',
          border: '#e8dcce',
          primary: '#8c6239',
          muted: '#807060',
        }
      case 'slate':
        return {
          bg: '#1e293b',
          fg: '#f8fafc',
          border: '#334155',
          primary: '#38bdf8',
          muted: '#94a3b8',
        }
      case 'classic':
        return {
          bg: '#ffffff',
          fg: '#000000',
          border: '#000000',
          primary: '#000000',
          muted: '#666666',
        }
      case 'light':
      default:
        return {
          bg: '#ffffff',
          fg: '#1e293b',
          border: '#e2e8f0',
          primary: '#6366f1',
          muted: '#64748b',
        }
    }
  }

  const getFontFamily = (font: PdfFont) => {
    switch (font) {
      case 'serif':
        return 'Georgia, serif'
      case 'mono':
        return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      case 'sans':
      default:
        return 'Inter, system-ui, -apple-system, sans-serif'
    }
  }

  const getMarginSize = (margin: PdfMargin) => {
    switch (margin) {
      case 'narrow':
        return '0.4in'
      case 'wide':
        return '1.2in'
      case 'standard':
      default:
        return '0.8in'
    }
  }

  // Handle Export operation
  const handleExport = () => {
    if (format === 'md') {
      exportMarkdown()
    } else {
      exportPdf()
    }
  }

  // Markdown Export Logic
  const exportMarkdown = () => {
    try {
      const docJson = JSON.parse(note.content)
      const mdContent = jsonToMarkdown(docJson, note.title)
      
      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${note.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'untitled'}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      onClose()
    } catch (err) {
      console.error('Failed to export markdown:', err)
      alert('Failed to export Markdown: ' + String(err))
    }
  }

  // PDF Export Logic using html2pdf.js library via script download
  const exportPdf = () => {
    if (!previewRef.current) return
    const printStyles = getThemeStyles(pdfTheme)

    // Clone the sheet paper mockup element to render full content heights
    const clone = previewRef.current.cloneNode(true) as HTMLDivElement
    
    // Set custom styles for A4 dimensions
    clone.style.width = '794px' // Standard A4 width in pixels (~210mm at 96 dpi)
    clone.style.maxWidth = 'none'
    clone.style.minWidth = 'none'
    clone.style.height = 'auto'
    clone.style.maxHeight = 'none'
    clone.style.overflow = 'visible'
    clone.style.boxShadow = 'none'
    clone.style.border = 'none'
    clone.style.borderRadius = '0'
    clone.style.margin = '0'
    clone.style.background = printStyles.bg
    clone.style.backgroundColor = printStyles.bg

    // Add page break helper styles to prevent elements from getting cut off across page boundaries
    const styleSheet = document.createElement('style')
    styleSheet.innerHTML = `
      body, html {
        background-color: ${printStyles.bg} !important;
        background: ${printStyles.bg} !important;
      }
      p, li, h1, h2, h3, h4, h5, h6, pre, table, tr, blockquote, img, .react-flow-wrapper {
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
      }
      .editor-preview-doc-content > * {
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
      }
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid !important;
        break-after: avoid-page !important;
      }
    `
    clone.appendChild(styleSheet)

    // Create wrapper that is inside positive viewport bounds but hidden under the layout
    const wrapper = document.createElement('div')
    wrapper.style.position = 'fixed'
    wrapper.style.left = '0'
    wrapper.style.top = '0'
    wrapper.style.width = '794px'
    wrapper.style.zIndex = '-9999' // Render behind body/app backgrounds
    wrapper.style.opacity = '1' // Keep at 1 opacity so html2canvas renders full text contrast
    wrapper.style.pointerEvents = 'none'
    wrapper.style.background = printStyles.bg

    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)

    const opt = {
      margin:       0,
      filename:     `${note.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'untitled'}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: printStyles.bg,
        logging: false
      },
      jsPDF:        { unit: 'px', format: 'a4', orientation: 'portrait', hotfixes: ['px_scaling'] },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    // @ts-ignore
    import('html2pdf.js').then((html2pdfModule) => {
      const html2pdf = html2pdfModule.default;
      html2pdf().from(clone).set(opt).save().then(() => {
        document.body.removeChild(wrapper)
        onClose()
      }).catch((err: any) => {
        console.error('PDF generation error:', err)
        document.body.removeChild(wrapper)
        alert('Failed to create PDF: ' + String(err))
      })
    }).catch(err => {
      console.error('Failed to load html2pdf.js module:', err)
      document.body.removeChild(wrapper)
      alert('Failed to load PDF module: ' + String(err))
    })
  }

  const themeStyles = getThemeStyles(pdfTheme)
  const fontFam = getFontFamily(pdfFont)
  const marginSize = getMarginSize(pdfMargin)

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        style={{
          maxWidth: '85vw',
          width: '1000px',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          gap: 0,
          overflow: 'hidden',
          background: 'var(--card-bg)',
          color: 'var(--fg)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <DialogHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <DialogTitle style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg)' }}>
            <Download size={18} style={{ color: 'var(--primary)' }} />
            <span>Export Premium Notes</span>
          </DialogTitle>
        </DialogHeader>

        {/* Content Body - Split Pane */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          
          {/* Left Panel: Settings */}
          <div style={{
            width: '380px',
            borderRight: '1px solid var(--border)',
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            background: 'rgba(255,255,255,0.01)',
          }}>
            
            {/* Format Choice */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Export Format</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setFormat('pdf')}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${format === 'pdf' ? 'var(--primary)' : 'var(--border)'}`,
                    background: format === 'pdf' ? 'var(--accent)' : 'transparent', color: format === 'pdf' ? 'var(--primary)' : 'var(--fg)',
                    fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}
                >
                  <FileText size={14} />
                  <span>PDF Document</span>
                </button>
                <button
                  onClick={() => setFormat('md')}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${format === 'md' ? 'var(--primary)' : 'var(--border)'}`,
                    background: format === 'md' ? 'var(--accent)' : 'transparent', color: format === 'md' ? 'var(--primary)' : 'var(--fg)',
                    fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}
                >
                  <span>📝 Markdown</span>
                </button>
              </div>
            </div>

            {format === 'pdf' && (
              <>
                {/* Typography Setting */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Type size={12} />
                    Typography
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['sans', 'serif', 'mono'] as PdfFont[]).map(font => (
                      <button
                        key={font}
                        onClick={() => setPdfFont(font)}
                        style={{
                          flex: 1, padding: '6px 4px', borderRadius: 6, border: '1px solid var(--border)',
                          background: pdfFont === font ? 'var(--accent)' : 'var(--bg)', color: pdfFont === font ? 'var(--primary)' : 'var(--fg-muted)',
                          fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize'
                        }}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Theme Setting */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Palette size={12} />
                    PDF Color Theme
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(['light', 'sepia', 'slate', 'classic'] as PdfTheme[]).map(theme => (
                      <button
                        key={theme}
                        onClick={() => setPdfTheme(theme)}
                        style={{
                          padding: '8px 10px', borderRadius: 8, border: `1px solid ${pdfTheme === theme ? 'var(--primary)' : 'var(--border)'}`,
                          background: pdfTheme === theme ? 'var(--accent)' : 'var(--bg)', color: pdfTheme === theme ? 'var(--primary)' : 'var(--fg)',
                          fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8
                        }}
                      >
                        <span style={{
                          width: 12, height: 12, borderRadius: '50%',
                          background: getThemeStyles(theme).bg, border: '1px solid #ddd'
                        }} />
                        <span style={{ textTransform: 'capitalize' }}>{theme}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margin Setting */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlignLeft size={12} />
                    Page Margin
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['narrow', 'standard', 'wide'] as PdfMargin[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setPdfMargin(m)}
                        style={{
                          flex: 1, padding: '6px 4px', borderRadius: 6, border: '1px solid var(--border)',
                          background: pdfMargin === m ? 'var(--accent)' : 'var(--bg)', color: pdfMargin === m ? 'var(--primary)' : 'var(--fg-muted)',
                          fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize'
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle elements */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckSquare size={12} />
                    Additional Settings
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={includeCover}
                      onChange={e => setIncludeCover(e.target.checked)}
                      disabled={!note.coverImage}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ color: note.coverImage ? 'var(--fg)' : 'var(--fg-muted)' }}>Include Cover Banner</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={includeMetadata}
                      onChange={e => setIncludeMetadata(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                    <span>Include Date & Author</span>
                  </label>
                </div>
              </>
            )}

            {format === 'md' && (
              <div style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', lineHeight: 1.5, background: 'var(--accent)', padding: '12px', borderRadius: '8px' }}>
                📌 <strong>Export Markdown</strong> will convert all text blocks, headings, lists, bookmarks, tables, callouts, and your notes into standard Markdown (.md) format compatible with various apps (Obsidian, Notion, etc).
              </div>
            )}

          </div>

          {/* Right Panel: Live Mockup / Preview */}
          <div style={{
            flex: 1,
            background: 'var(--bg)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{ position: 'absolute', top: 12, left: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--fg-muted)' }}>
              <Eye size={12} />
              <span>Export Page Preview</span>
            </div>

            {/* Simulated Sheet Paper */}
            <div
              ref={previewRef}
              className="export-pdf-mockup-sheet"
              style={{
                width: '100%',
                maxWidth: '460px',
                height: '92%',
                background: format === 'pdf' ? themeStyles.bg : 'var(--card-bg)',
                color: format === 'pdf' ? themeStyles.fg : 'var(--fg)',
                border: `1px solid ${format === 'pdf' ? themeStyles.border : 'var(--border)'}`,
                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                borderRadius: '6px',
                padding: format === 'pdf' ? marginSize : '0.6in',
                overflowY: 'auto',
                fontFamily: format === 'pdf' ? fontFam : 'var(--font-body)',
                boxSizing: 'border-box',
                transition: 'all 0.2s',
                ...(format === 'pdf' ? {
                  '--fg': themeStyles.fg,
                  '--bg': themeStyles.bg,
                  '--border': themeStyles.border,
                  '--card-bg': themeStyles.bg,
                  '--fg-muted': themeStyles.muted,
                } : {})
              } as any}
            >
              {/* Simulated cover image */}
              {format === 'pdf' && includeCover && note.coverImage && (
                <div style={{
                  width: '100%',
                  height: '70px',
                  backgroundImage: note.coverImage.startsWith('linear-gradient') ? note.coverImage : `url(${note.coverImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: '4px',
                  marginBottom: '16px',
                }} />
              )}

              {/* Title & Icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {note.icon && <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{note.icon}</span>}
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{note.title || 'Untitled'}</h2>
              </div>

              {/* Metadata */}
              {format === 'pdf' && includeMetadata && (
                <div style={{ display: 'flex', gap: 12, fontSize: '0.65rem', color: themeStyles.muted, borderBottom: `1px solid ${themeStyles.border}`, paddingBottom: 6, marginBottom: 12 }}>
                  <span>Created: {new Date(note.createdAt).toLocaleDateString('en-US')}</span>
                  {note.createdByUsername && <span>Author: {note.createdByUsername}</span>}
                </div>
              )}

              {/* Content Body preview container */}
              <div 
                className="editor-preview-doc-content"
                style={{ 
                  fontSize: '0.75rem', 
                  lineHeight: 1.5, 
                  opacity: 0.85 
                }}
              >
                <DocContent segments={segments} />
              </div>

            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', fontSize: '0.8125rem',
              fontFamily: 'var(--font-body)',
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'transparent', cursor: 'pointer', color: 'var(--fg-muted)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            style={{
              padding: '6px 20px', fontSize: '0.8125rem',
              fontFamily: 'var(--font-body)',
              border: 'none', borderRadius: 6,
              background: 'var(--primary)', cursor: 'pointer',
              color: 'var(--primary-fg)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <Download size={14} />
            <span>Export Now</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
