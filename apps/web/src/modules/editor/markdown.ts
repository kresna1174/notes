import { marked } from 'marked'

/**
 * Convert a TipTap/ProseMirror JSON document into Markdown.
 *
 * Extracted from ExportModal so it can be reused by the skill editor.
 * When `title` is a non-empty string it is prepended as an H1; pass an
 * empty string (or omit) to serialize the body only — used for skills,
 * which don't carry a note title.
 */
export function jsonToMarkdown(docJson: any, title = ''): string {
  let md = title ? `# ${title}\n\n` : ''
  if (!docJson || !docJson.content) return md.trim()

  const inlineToText = (content: any[]): string => {
    return (content || []).map((n: any) => {
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
        const mimeType = node.attrs?.mimeType || ''
        const attachmentId = node.attrs?.attachmentId || ''
        if (mimeType.startsWith('image/') && attachmentId) {
          const url = `${window.location.origin}/api/attachments/${attachmentId}/inline`
          return `![${filename}](${url})\n\n`
        }
        return `*[Lampiran: ${filename}]*\n\n`
      }
      case 'image': {
        const src = node.attrs?.src || ''
        const alt = node.attrs?.alt || 'image'
        if (!src) return ''
        return `![${alt}](${src})\n\n`
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

  docJson.content.forEach((node: any) => {
    md += parseNode(node)
  })

  return md.trim()
}

/**
 * Convert Markdown into HTML that TipTap can parse as initial editor content.
 */
export function markdownToHtml(md: string): string {
  return marked.parse(md ?? '', { async: false, breaks: true, gfm: true }) as string
}
