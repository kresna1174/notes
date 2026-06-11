import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import { Suggestion } from '@tiptap/suggestion'
import { useState, forwardRef, useImperativeHandle } from 'react'

const COMMANDS = [
  { title: 'Heading 1', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run() },
  { title: 'Bullet List', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: 'Ordered List', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: 'Code Block', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { title: 'Blockquote', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: 'Table', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3 }).run() },
  { title: 'Divider', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  { title: 'Diagram', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'diagram', attrs: { data: JSON.stringify({ nodes: [], edges: [] }) } }).run() },
  { title: 'Attachment', command: ({ editor, range }: any) => {
    editor.chain().focus().deleteRange(range).insertContent({ type: 'attachment', attrs: {} }).run()
  }},
]

const CommandList = forwardRef(({ items, command }: any, ref) => {
  const [selected, setSelected] = useState(0)

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') { setSelected(s => Math.max(0, s - 1)); return true }
      if (event.key === 'ArrowDown') { setSelected(s => Math.min(items.length - 1, s + 1)); return true }
      if (event.key === 'Enter') { command(items[selected]); return true }
      return false
    },
  }))

  return (
    <div className="bg-background border rounded-md shadow-lg py-1 min-w-[180px] z-50">
      {items.map((item: any, i: number) => (
        <button
          key={item.title}
          onClick={() => command(item)}
          className={`flex w-full px-3 py-1.5 text-sm text-left hover:bg-accent ${i === selected ? 'bg-accent' : ''}`}
        >
          {item.title}
        </button>
      ))}
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
          COMMANDS.filter(c => c.title.toLowerCase().includes(query.toLowerCase())),
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

              const rect = props.getReferenceClientRect()
              popup.style.top = `${rect.bottom + 8}px`
              popup.style.left = `${rect.left}px`
            },
            onUpdate: (props: any) => {
              component.updateProps(props)
              const rect = props.getReferenceClientRect()
              popup.style.top = `${rect.bottom + 8}px`
              popup.style.left = `${rect.left}px`
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
