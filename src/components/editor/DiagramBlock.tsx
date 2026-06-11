import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'

function DiagramNodeView() {
  return (
    <NodeViewWrapper>
      <div className="border rounded-lg bg-muted/30 flex items-center justify-center h-20 text-sm text-muted-foreground">
        Diagram block (loading...)
      </div>
    </NodeViewWrapper>
  )
}

export const DiagramBlock = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  addAttributes() {
    return { data: { default: JSON.stringify({ nodes: [], edges: [] }) } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="diagram"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(DiagramNodeView)
  },
})
