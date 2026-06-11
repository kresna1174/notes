import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Image } from '@tiptap/extension-image'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import { Placeholder } from '@tiptap/extension-placeholder'
import { SlashCommandExtension } from './SlashCommand'
import { DiagramBlock } from './DiagramBlock'
import { AttachmentBlockExtension } from './AttachmentBlock'
import { useEffect, useRef, useState } from 'react'

interface Note {
  id: string
  title: string
  content: string
}

interface EditorProps {
  note: Note
  onUpdate: (fields: { title?: string; content?: string }) => Promise<void>
}

export function Editor({ note, onUpdate }: EditorProps) {
  const [title, setTitle] = useState(note.title)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      HorizontalRule,
      Placeholder.configure({ placeholder: "Type '/' for commands..." }),
      SlashCommandExtension,
      DiagramBlock,
      AttachmentBlockExtension,
    ],
    content: (() => {
      try { return JSON.parse(note.content) } catch { return {} }
    })(),
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onUpdate({ content: JSON.stringify(editor.getJSON()) })
      }, 1000)
    },
  })

  useEffect(() => {
    return () => clearTimeout(saveTimer.current)
  }, [])

  useEffect(() => {
    if (editor) {
      ;(editor.storage as any).noteId = note.id
    }
  }, [editor, note.id])

  useEffect(() => {
    setTitle(note.title)
    if (editor && note.content) {
      try {
        editor.commands.setContent(JSON.parse(note.content))
      } catch {}
    }
  }, [note.id])

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onUpdate({ title: e.target.value })
    }, 1000)
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <input
        ref={titleRef}
        value={title}
        onChange={handleTitleChange}
        placeholder="Untitled"
        className="w-full text-4xl font-bold outline-none bg-transparent mb-8 placeholder:text-muted-foreground"
      />
      <EditorContent
        editor={editor}
        className="prose prose-neutral dark:prose-invert max-w-none min-h-[60vh] focus-within:outline-none [&_.ProseMirror]:outline-none"
      />
    </div>
  )
}
