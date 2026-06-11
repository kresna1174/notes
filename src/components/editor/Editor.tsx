// src/components/editor/Editor.tsx - PLACEHOLDER, will be replaced in Task 7
interface Note { id: string; title: string; content: string }
interface EditorProps { note: Note; onUpdate: (fields: { title?: string; content?: string }) => Promise<void> }
export function Editor({ note }: EditorProps) {
  return <div className="p-8"><h1 className="text-2xl font-bold">{note.title || 'Untitled'}</h1><p className="text-muted-foreground mt-4">Editor loading...</p></div>
}
