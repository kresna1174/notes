import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import { Suggestion } from '@tiptap/suggestion'
import { useState, forwardRef, useImperativeHandle, useEffect, useRef } from 'react'
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  ChevronRight,
  Quote,
  Info,
  Minus,
  Table,
  Network,
  Link2,
  FileText,
  Code,
  Paperclip,
  Sparkles
} from 'lucide-react'

const COMMANDS = [
  // Basic Blocks
  {
    category: 'Basic Blocks',
    title: 'Text',
    description: 'Start writing with a plain text paragraph.',
    icon: Type,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setParagraph().run()
  },
  {
    category: 'Basic Blocks',
    title: 'Heading 1',
    description: 'Large section heading.',
    icon: Heading1,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
  },
  {
    category: 'Basic Blocks',
    title: 'Heading 2',
    description: 'Medium section heading.',
    icon: Heading2,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
  },
  {
    category: 'Basic Blocks',
    title: 'Heading 3',
    description: 'Small section heading.',
    icon: Heading3,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
  },
  {
    category: 'Basic Blocks',
    title: 'Bulleted List',
    description: 'Create a simple bulleted list.',
    icon: List,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
  },
  {
    category: 'Basic Blocks',
    title: 'Numbered List',
    description: 'Create a list with sequential numbers.',
    icon: ListOrdered,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
  },
  {
    category: 'Basic Blocks',
    title: 'Task List (To-Do)',
    description: 'Create an interactive task checklist.',
    icon: CheckSquare,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
  },
  {
    category: 'Basic Blocks',
    title: 'Toggle List',
    description: 'Collapsible block to hide details.',
    icon: ChevronRight,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'toggleBlock', attrs: { open: true } }).run()
  },
  {
    category: 'Basic Blocks',
    title: 'Quote',
    description: 'Write an important text quote.',
    icon: Quote,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleBlockquote().run()
  },
  {
    category: 'Basic Blocks',
    title: 'Callout',
    description: 'Highlight block with colored background and icon.',
    icon: Info,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'callout', attrs: { icon: '💡' } }).run()
  },
  {
    category: 'Basic Blocks',
    title: 'Divider',
    description: 'Horizontal line to separate content.',
    icon: Minus,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
  },

  // Media & Advanced
  {
    category: 'Media & Advanced',
    title: 'Table',
    description: 'Insert a simple data table.',
    icon: Table,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3 }).run()
  },
  {
    category: 'Media & Advanced',
    title: 'Diagram',
    description: 'Create an interactive flowchart (ReactFlow).',
    icon: Network,
    command: ({ editor, range }: any) => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15)
      editor.chain().focus().deleteRange(range).insertContent({ type: 'diagram', attrs: { id, data: JSON.stringify({ nodes: [], edges: [] }) } }).run()
    }
  },
  {
    category: 'Media & Advanced',
    title: 'Web Bookmark',
    description: 'Insert a web page link preview.',
    icon: Link2,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'webBookmark', attrs: {} }).run()
  },
  {
    category: 'Media & Advanced',
    title: 'Table of Contents (TOC)',
    description: 'Automatic heading index list.',
    icon: FileText,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'tableOfContents' }).run()
  },
  {
    category: 'Media & Advanced',
    title: 'Code Block',
    description: 'Write a code block with formatted syntax.',
    icon: Code,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
  },
  {
    category: 'Media & Advanced',
    title: 'Attachment (File)',
    description: 'Upload and attach a file or photo.',
    icon: Paperclip,
    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'attachment', attrs: {} }).run()
  },
  // AI Assistants
  {
    category: 'AI Assistants',
    title: 'Write with AI',
    description: 'Generate text automatically using AI assistant.',
    icon: Sparkles,
    command: ({ editor, range }: any) => {
      editor.chain().focus().deleteRange(range).run()
      window.dispatchEvent(new CustomEvent('open-ai-prompt-bar'))
    }
  },
]

const CommandList = forwardRef(({ items, command }: any, ref) => {
  const [selected, setSelected] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelected(0)
  }, [items])

  useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.querySelector('[data-selected="true"]') as HTMLElement
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selected])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        setSelected(s => (s === 0 ? items.length - 1 : s - 1))
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected(s => (s === items.length - 1 ? 0 : s + 1))
        return true
      }
      if (event.key === 'Enter') {
        if (items[selected]) {
          command(items[selected])
          return true
        }
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.2)',
          padding: '12px 16px',
          width: '280px',
          zIndex: 9999,
          fontSize: '0.85rem',
          color: 'var(--fg-muted)',
          textAlign: 'center',
          fontFamily: 'var(--font-body)'
        }}
      >
        No results found
      </div>
    )
  }

  let lastCategory = ''

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        boxShadow: '0 10px 30px -5px rgba(0,0,0,0.2)',
        padding: '4px',
        width: '280px',
        zIndex: 9999,
        maxHeight: '330px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        ref={containerRef}
        style={{
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {items.map((item: any, i: number) => {
          const showHeader = item.category !== lastCategory
          lastCategory = item.category

          return (
            <div key={item.title} style={{ display: 'flex', flexDirection: 'column' }}>
              {showHeader && (
                <div
                  style={{
                    fontSize: '0.675rem',
                    fontWeight: 700,
                    color: 'var(--fg-subtle)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '6px 10px 4px 10px',
                  }}
                >
                  {item.category}
                </div>
              )}
              <button
                data-selected={i === selected ? 'true' : 'false'}
                onClick={() => command(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: '10px',
                  backgroundColor: i === selected ? 'var(--accent)' : 'transparent',
                  color: i === selected ? 'var(--accent-fg)' : 'var(--fg)',
                  transition: 'background-color 0.1s',
                }}
              >
                {/* Icon wrapper */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '30px',
                    height: '30px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: i === selected ? 'var(--card-bg)' : 'var(--bg-app)',
                    color: i === selected ? 'var(--primary)' : 'var(--fg-muted)',
                    flexShrink: 0,
                  }}
                >
                  <item.icon size={15} />
                </div>

                {/* Info Text */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>{item.title}</span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: i === selected ? 'var(--accent-fg)' : 'var(--fg-muted)',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      opacity: i === selected ? 0.9 : 0.8,
                    }}
                  >
                    {item.description}
                  </span>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
})
CommandList.displayName = 'CommandList'

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return { suggestion: {} }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }) => props.command({ editor, range }),
        items: ({ query }: { query: string }) =>
          COMMANDS.filter(
            c =>
              c.title.toLowerCase().includes(query.toLowerCase()) ||
              c.description.toLowerCase().includes(query.toLowerCase())
          ),
        render: () => {
          let component: ReactRenderer
          let popup: HTMLDivElement

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(CommandList, { props, editor: props.editor })
              popup = document.createElement('div')
              popup.style.position = 'fixed'
              popup.style.zIndex = '9999'
              document.body.appendChild(popup)
              popup.appendChild(component.element)

              const rect = typeof props.clientRect === 'function' ? props.clientRect() : null
              if (rect) {
                const spaceBelow = window.innerHeight - rect.bottom
                if (spaceBelow < 340) {
                  popup.style.bottom = `${window.innerHeight - rect.top + 8}px`
                  popup.style.top = 'auto'
                } else {
                  popup.style.top = `${rect.bottom + 8}px`
                  popup.style.bottom = 'auto'
                }
                popup.style.left = `${rect.left}px`
              }
            },
            onUpdate: (props: any) => {
              component.updateProps(props)
              const rect = typeof props.clientRect === 'function' ? props.clientRect() : null
              if (rect) {
                const spaceBelow = window.innerHeight - rect.bottom
                if (spaceBelow < 340) {
                  popup.style.bottom = `${window.innerHeight - rect.top + 8}px`
                  popup.style.top = 'auto'
                } else {
                  popup.style.top = `${rect.bottom + 8}px`
                  popup.style.bottom = 'auto'
                }
                popup.style.left = `${rect.left}px`
              }
            },
            onKeyDown: (props: any) => (component.ref as any)?.onKeyDown(props),
            onExit: () => {
              popup?.remove()
              component?.destroy()
            },
          }
        },
        ...this.options.suggestion,
      }),
    ]
  },
})
