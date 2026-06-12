import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { ABOUT_MARKDOWN } from '../../lib/aboutContent'
import { marked } from 'marked'
import { Info } from 'lucide-react'

interface AboutModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AboutModal({ open, onOpenChange }: AboutModalProps) {
  const htmlContent = marked.parse(ABOUT_MARKDOWN, { breaks: true, gfm: true }) as string

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-6 overflow-hidden bg-card border">
        <DialogHeader className="flex flex-row items-center gap-2 border-b pb-4 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-primary">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold font-heading text-fg">Tentang & Catatan Rilis</DialogTitle>
            <p className="text-xs text-fg-muted">Homebrew Notes Changelog & Info</p>
          </div>
        </DialogHeader>
        <div 
          className="flex-1 overflow-y-auto pr-2 mt-4 text-sm text-fg"
          style={{
            lineHeight: 1.6,
            fontFamily: 'var(--font-body)',
          }}
        >
          {/* Custom Styled Markdown Container for maximum compatibility */}
          <div 
            className="about-markdown-content"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
        {/* Style block for formatting HTML headings and bullets inside the modal */}
        <style dangerouslySetInnerHTML={{ __html: `
          .about-markdown-content h1 {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--fg);
            margin-top: 8px;
            margin-bottom: 4px;
            font-family: var(--font-heading);
          }
          .about-markdown-content h2 {
            font-size: 1.15rem;
            font-weight: 600;
            color: var(--fg);
            margin-top: 16px;
            margin-bottom: 6px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 4px;
            font-family: var(--font-heading);
          }
          .about-markdown-content h3 {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--fg);
            margin-top: 12px;
            margin-bottom: 4px;
          }
          .about-markdown-content p {
            margin: 4px 0 8px;
            color: var(--fg-muted);
          }
          .about-markdown-content ul {
            margin: 4px 0 12px;
            padding-left: 20px;
            list-style-type: disc;
            color: var(--fg-muted);
          }
          .about-markdown-content li {
            margin-bottom: 4px;
          }
          .about-markdown-content li p {
            margin: 0;
            display: inline;
          }
          .about-markdown-content code {
            font-family: monospace;
            background: var(--muted);
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 0.85em;
            color: var(--primary);
          }
          .about-markdown-content hr {
            border: 0;
            border-top: 1px solid var(--border);
            margin: 16px 0;
          }
          .about-markdown-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0;
            font-size: 0.85rem;
          }
          .about-markdown-content th, .about-markdown-content td {
            border: 1px solid var(--border);
            padding: 8px 10px;
            text-align: left;
          }
          .about-markdown-content th {
            background: var(--muted);
            font-weight: 600;
          }
        `}} />
      </DialogContent>
    </Dialog>
  )
}
