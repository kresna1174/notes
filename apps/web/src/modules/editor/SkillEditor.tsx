import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useRef } from 'react'
import { BubbleToolbar } from './BubbleToolbar'
import { jsonToMarkdown, markdownToHtml } from './markdown'

interface SkillEditorProps {
  /** Skill instructions as markdown. Used only as the initial value (component is uncontrolled after mount). */
  value: string
  /** Called with serialized markdown whenever the content changes (debounced). */
  onChange: (markdown: string) => void
  placeholder?: string
}

/**
 * Lightweight TipTap editor for AI skill instructions.
 *
 * Reuses the same editing extensions and bubble toolbar as the note Editor,
 * but without Yjs collaboration / PIN / share / attachments. Content is loaded
 * from markdown and serialized back to markdown on every change, so the DB
 * always stores pure markdown.
 */
export function SkillEditor({ value, onChange, placeholder }: SkillEditorProps) {
  // Keep the latest onChange in a ref so the editor's onUpdate never uses a stale closure.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      HorizontalRule,
      Placeholder.configure({ placeholder: placeholder ?? 'Write the skill instructions in markdown…' }),
      TextStyle,
      Color,
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({ autolink: true, openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: markdownToHtml(value),
    onUpdate: ({ editor }) => {
      // Update immediately (parent just stores markdown in state) so mode-switch
      // and Save always see the current content — no debounce race to drop edits.
      onChangeRef.current(jsonToMarkdown(editor.getJSON()))
    },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {editor && <BubbleToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[240px]"
        style={{ outline: 'none' }}
      />
    </div>
  )
}
