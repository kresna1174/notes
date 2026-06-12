import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const key = new PluginKey('activeLine')

export const ActiveLineExtension = Extension.create({
  name: 'activeLine',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const { doc, selection } = state
            const { $anchor } = selection

            // depth 0 = doc root, depth 1 = top-level block
            if ($anchor.depth < 1) return DecorationSet.empty

            const node = $anchor.node(1)
            if (!node || node.type.isAtom) return DecorationSet.empty

            const from = $anchor.before(1)
            const to = $anchor.after(1)

            return DecorationSet.create(doc, [
              Decoration.node(from, to, { class: 'active-block' }),
            ])
          },
        },
      }),
    ]
  },
})
