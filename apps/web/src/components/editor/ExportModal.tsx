import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Download, FileText, Settings, Type, AlignLeft, Palette, CheckSquare, X, Eye } from 'lucide-react'
import { docToSegments, DocContent } from './DocRenderer'

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
      alert('Gagal mengekspor Markdown: ' + String(err))
    }
  }

  // PDF Export Logic using temporary CSS injector & print wrapper
  const exportPdf = () => {
    const printStyles = getThemeStyles(pdfTheme)
    const fontFam = getFontFamily(pdfFont)
    const marginSize = getMarginSize(pdfMargin)

    // Create container for print content
    const printDiv = document.createElement('div')
    printDiv.id = 'premium-print-section'
    
    // Construct PDF DOM structure
    printDiv.innerHTML = `
      <div class="print-container" style="
        font-family: ${fontFam};
        color: ${printStyles.fg};
        background: ${printStyles.bg};
        padding: ${marginSize};
        min-height: 100%;
        box-sizing: border-box;
      ">
        ${includeCover && note.coverImage ? `
          <div class="print-cover" style="
            width: 100%;
            height: 150px;
            background-image: ${note.coverImage.startsWith('linear-gradient') ? note.coverImage : `url(${note.coverImage})`};
            background-size: cover;
            background-position: center;
            border-radius: 8px;
            margin-bottom: 24px;
          "></div>
        ` : ''}

        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          ${note.icon ? `<span style="font-size: 3rem; line-height: 1;">${note.icon}</span>` : ''}
          <h1 style="margin: 0; font-size: 2.2rem; font-weight: 800; letter-spacing: -0.02em;">${note.title}</h1>
        </div>

        ${includeMetadata ? `
          <div style="
            display: flex;
            gap: 16px;
            font-size: 0.8rem;
            color: ${printStyles.muted};
            border-bottom: 1px solid ${printStyles.border};
            padding-bottom: 12px;
            margin-bottom: 24px;
          ">
            <span>Dibuat: ${new Date(note.createdAt).toLocaleDateString('id-ID')}</span>
            <span>Diperbarui: ${new Date(note.updatedAt).toLocaleDateString('id-ID')}</span>
            ${note.createdByUsername ? `<span>Penulis: ${note.createdByUsername}</span>` : ''}
          </div>
        ` : ''}

        <div class="print-content" style="font-size: 1rem; line-height: 1.6;">
          ${document.querySelector('.editor-preview-doc-content')?.innerHTML || ''}
        </div>
      </div>
    `

    // Stylesheet injection
    const styleEl = document.createElement('style')
    styleEl.id = 'premium-print-style'
    styleEl.innerHTML = `
      @media print {
        body * {
          visibility: hidden !important;
        }
        #premium-print-section, #premium-print-section * {
          visibility: visible !important;
        }
        #premium-print-section {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          background: ${printStyles.bg} !important;
        }
        @page {
          size: A4;
          margin: 0;
        }
      }
    `

    // Append nodes to DOM
    document.body.appendChild(printDiv)
    document.head.appendChild(styleEl)

    // Trigger Print
    setTimeout(() => {
      window.print()
      // Cleanup DOM
      document.body.removeChild(printDiv)
      document.head.removeChild(styleEl)
      onClose()
    }, 200)
  }

  // Tiptap JSON to Markdown Parser
  const jsonToMarkdown = (docJson: any, title: string): string => {
    let md = `# ${title}\n\n`
    if (!docJson || !docJson.content) return md

    const parseNode = (node: any): string => {
      switch (node.type) {
        case 'heading': {
          const level = node.attrs?.level || 1
          const prefix = '#'.repeat(level)
          return `${prefix} ${inlineToText(node.content)}\n\n`
        }
        case 'paragraph': {
          return `${inlineToText(node.content)}\n\n`
        }
        case 'bulletList': {
          return (node.content || []).map((li: any) => `* ${inlineToText(li.content)}`).join('\n') + '\n\n'
        }
        case 'orderedList': {
          return (node.content || []).map((li: any, idx: number) => `${idx + 1}. ${inlineToText(li.content)}`).join('\n') + '\n\n'
        }
        case 'codeBlock': {
          const lang = node.attrs?.language || ''
          return `\`\`\`${lang}\n${inlineToText(node.content)}\n\`\`\`\n\n`
        }
        case 'blockquote': {
          return `> ${inlineToText(node.content)}\n\n`
        }
        case 'horizontalRule': {
          return `---\n\n`
        }
        case 'callout': {
          const emoji = node.attrs?.emoji || '💡'
          return `> **${emoji} Callout**\n> ${inlineToText(node.content)}\n\n`
        }
        case 'table': {
          const rows = node.content || []
          if (rows.length === 0) return ''
          let tableMd = ''
          rows.forEach((row: any, rIdx: number) => {
            const cells = row.content || []
            const cellTexts = cells.map((cell: any) => inlineToText(cell.content).replace(/\|/g, '\\|'))
            tableMd += `| ${cellTexts.join(' | ')} |\n`
            if (rIdx === 0) {
              tableMd += `| ${cells.map(() => '---').join(' | ')} |\n`
            }
          })
          return tableMd + '\n'
        }
        case 'diagram': {
          try {
            const data = JSON.parse(node.attrs?.data || '{}')
            const nodes = data.nodes || []
            return `*[Diagram: ${nodes.length} nodes]*\n\n`
          } catch {
            return `*[Diagram]*\n\n`
          }
        }
        case 'attachment': {
          const filename = node.attrs?.filename || 'attachment'
          return `*[Lampiran: ${filename}]*\n\n`
        }
        case 'webBookmark': {
          const url = node.attrs?.url || ''
          const titleStr = node.attrs?.title || url
          return `[Bookmark: ${titleStr}](${url})\n\n`
        }
        case 'taskList': {
          return (node.content || []).map((item: any) => {
            const checked = item.attrs?.checked ? '[x]' : '[ ]'
            return `- ${checked} ${inlineToText(item.content)}`
          }).join('\n') + '\n\n'
        }
        default:
          if (node.content) {
            return node.content.map(parseNode).join('')
          }
          return ''
      }
    }

    const inlineToText = (content: any[]): string => {
      return (content || []).map(n => {
        if (n.type === 'text') {
          let t = n.text || ''
          const marks = (n.marks || []).map((m: any) => m.type)
          if (marks.includes('bold')) t = `**${t}**`
          if (marks.includes('italic')) t = `*${t}*`
          if (marks.includes('strike')) t = `~~${t}~~`
          if (marks.includes('code')) t = `\`${t}\``
          const link = (n.marks || []).find((m: any) => m.type === 'link')
          if (link) t = `[${t}](${link.attrs?.href || ''})`
          return t
        }
        if (n.type === 'hardBreak') return '\n'
        return parseNode(n)
      }).join('')
    }

    docJson.content.forEach((node: any) => {
      md += parseNode(node)
    })

    return md.trim()
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
            <span>Ekspor Catatan Premium</span>
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
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Format Ekspor</span>
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
                    Tipografi
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
                    Tema Warna PDF
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
                    Margin Halaman
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
                    Pengaturan Tambahan
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={includeCover}
                      onChange={e => setIncludeCover(e.target.checked)}
                      disabled={!note.coverImage}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ color: note.coverImage ? 'var(--fg)' : 'var(--fg-muted)' }}>Sertakan Cover Banner</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={includeMetadata}
                      onChange={e => setIncludeMetadata(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                    <span>Sertakan Tanggal & Penulis</span>
                  </label>
                </div>
              </>
            )}

            {format === 'md' && (
              <div style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', lineHeight: 1.5, background: 'var(--accent)', padding: '12px', borderRadius: '8px' }}>
                📌 <strong>Ekspor Markdown</strong> akan mengubah semua block tulisan, heading, list, bookmark, tabel, callout, dan catatan Anda menjadi format teks Markdown (.md) standar yang kompatibel dengan berbagai aplikasi (Obsidian, Notion, dll).
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
              <span>Pratinjau Halaman Ekspor</span>
            </div>

            {/* Simulated Sheet Paper */}
            <div
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
              }}
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
                  <span>Dibuat: {new Date(note.createdAt).toLocaleDateString('id-ID')}</span>
                  {note.createdByUsername && <span>Penulis: {note.createdByUsername}</span>}
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
            Batal
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
            <span>Ekspor Sekarang</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
