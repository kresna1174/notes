import { useEffect, useState, useRef } from 'react'
import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { GripVertical, Plus } from 'lucide-react'

interface DragHandleProps {
  editor: Editor | null
}

export function DragHandle({ editor }: DragHandleProps) {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null)
  const [top, setTop] = useState(0)
  const [left, setLeft] = useState(0)
  const [visible, setVisible] = useState(false)
  const [isHoveringHandle, setIsHoveringHandle] = useState(false)
  
  const dragHandleRef = useRef<HTMLDivElement>(null)
  const isHoveringHandleRef = useRef(false)
  isHoveringHandleRef.current = isHoveringHandle

  // Helper to dynamically calculate fixed coordinates based on active element
  function updatePosition(block: HTMLElement, wrapper: HTMLElement) {
    const rect = block.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    const blockStyle = window.getComputedStyle(block)
    const lineHeight = parseInt(blockStyle.lineHeight) || 24
    const paddingTop = parseInt(blockStyle.paddingTop) || 0
    
    // Use a constant baseline font size (15px) so the gap is uniform across all block types (including H1)
    const baseFontSize = 15
    const gap = baseFontSize * 1.2 // Constant gap of 18px (~1.2em of baseline)
    const containerWidth = 50 // Plus (24) + Gap (2) + Grip (24)
    
    // Position vertically centered relative to viewport
    const y = rect.top + paddingTop + (lineHeight - 24) / 2
    const x = rect.left - (gap + containerWidth)

    setTop(y)
    
    // Prevent overlapping the text block (ensure at least a 4px gap)
    const maxLeftToAvoidOverlap = rect.left - (containerWidth + 4)
    const clampedX = Math.min(maxLeftToAvoidOverlap, Math.max(wrapperRect.left + 8, x))
    
    setLeft(clampedX)
  }

  useEffect(() => {
    if (!editor || !editor.view) return

    const editorDom = editor.view.dom
    const scrollContainer = editorDom.parentElement
    const wrapper = editorDom.closest('.editor-content-wrapper') || editorDom.parentElement || document.body

    function findDraggableBlock(el: HTMLElement) {
      let current = el
      while (current && current.parentElement) {
        if (current.parentElement === editorDom) {
          return current // top-level block
        }
        if (
          current.tagName === 'LI' ||
          current.getAttribute('data-type') === 'callout' ||
          current.getAttribute('data-type') === 'diagram' ||
          current.getAttribute('data-type') === 'toggle-block' ||
          current.getAttribute('data-type') === 'bookmark'
        ) {
          return current
        }
        current = current.parentElement
      }
      return null
    }

    function handleMouseMove(e: MouseEvent) {
      if (editor.isDestroyed) return
      if (e.buttons > 0) return // dragging

      const target = e.target as HTMLElement
      if (!target) return

      // Keep it visible if hovering handle itself
      if (dragHandleRef.current && dragHandleRef.current.contains(target)) {
        setVisible(true)
        return
      }

      const block = findDraggableBlock(target)

      if (block) {
        setHoveredElement(block)
        updatePosition(block, wrapper as HTMLElement)
        setVisible(true)
      } else {
        // Safe zone check: if mouse is vertically close to the active block
        // and horizontally close to the handle, don't hide it yet.
        if (hoveredElement && visible) {
          const rect = hoveredElement.getBoundingClientRect()
          const isVerticallyClose = e.clientY >= rect.top - 12 && e.clientY <= rect.bottom + 12
          const isHorizontallyClose = e.clientX >= left - 20 && e.clientX <= rect.left + 50
          
          if (isVerticallyClose && isHorizontallyClose) {
            setVisible(true)
            return
          }
        }

        // Hide only if mouse is outside the editor wrapper AND not hovering the handle
        if (wrapper && !wrapper.contains(target) && !isHoveringHandleRef.current) {
          setVisible(false)
        }
      }
    }

    function handleScroll() {
      if (hoveredElement && visible && wrapper) {
        updatePosition(hoveredElement, wrapper as HTMLElement)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [editor, hoveredElement, visible, left])

  if (!editor || !visible || !hoveredElement) return null

  function handleDragStart(e: React.DragEvent) {
    if (!editor || !hoveredElement) return

    const view = editor.view
    const parent = hoveredElement.parentElement
    if (!parent) return
    const index = Array.from(parent.childNodes).indexOf(hoveredElement)
    if (index < 0) return
    const pos = view.posAtDOM(parent, index)
    if (pos === undefined || pos < 0) return

    const node = view.state.doc.nodeAt(pos)
    if (!node) return

    // Set globally for our custom drop handler in Editor.tsx
    ;(window as any).__dragStartPos = pos
    ;(window as any).__draggedNode = node

    const nodeSelection = NodeSelection.create(view.state.doc, pos)
    view.dispatch(view.state.tr.setSelection(nodeSelection))
    view.focus()

    // Make the entire block look like it is floating during drag
    const rect = hoveredElement.getBoundingClientRect()
    const xOffset = e.clientX - rect.left
    const yOffset = e.clientY - rect.top
    e.dataTransfer.setDragImage(hoveredElement, xOffset, yOffset)

    // Set standard data transfer text plain so browser knows it's a drag
    e.dataTransfer.setData('text/plain', hoveredElement.textContent || '')

    // Dispatch native dragstart event to ProseMirror DOM so it draws the drop cursor line
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      clientX: e.clientX,
      clientY: e.clientY,
      dataTransfer: e.dataTransfer,
    })
    view.dom.dispatchEvent(dragStartEvent)
  }

  function handlePlusClick() {
    if (!editor || !hoveredElement) return

    const view = editor.view
    const parent = hoveredElement.parentElement
    if (!parent) return
    const index = Array.from(parent.childNodes).indexOf(hoveredElement)
    if (index < 0) return
    const pos = view.posAtDOM(parent, index)
    if (pos === undefined || pos < 0) return

    const node = view.state.doc.nodeAt(pos)
    if (!node) return

    const insertPos = pos + node.nodeSize
    // Insert a new paragraph initialized with "/" to trigger the slash command popup
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, {
        type: 'paragraph',
        content: [{ type: 'text', text: '/' }],
      })
      .run()
  }

  return (
    <div
      ref={dragHandleRef}
      onMouseEnter={() => setIsHoveringHandle(true)}
      onMouseLeave={() => setIsHoveringHandle(false)}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        zIndex: 50,
        height: '24px',
        pointerEvents: 'auto',
      }}
      className="drag-handle-container"
    >
      {/* Plus Quick Add Button */}
      <button
        onClick={handlePlusClick}
        title="Sisipkan baris baru di bawah"
        style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: '4px',
          color: 'var(--fg-muted)',
          cursor: 'pointer',
          padding: 0,
          transition: 'background-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--primary)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'var(--fg-muted)'
        }}
      >
        <Plus size={18} />
      </button>

      {/* Grip Drag Handle */}
      <div
        draggable="true"
        onDragStart={handleDragStart}
        title="Geser untuk memindahkan baris"
        style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          color: 'var(--fg-muted)',
          cursor: 'grab',
          transition: 'background-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--primary)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'var(--fg-muted)'
        }}
        onMouseDown={e => {
          e.currentTarget.style.cursor = 'grabbing'
        }}
        onMouseUp={e => {
          e.currentTarget.style.cursor = 'grab'
        }}
      >
        <GripVertical size={18} />
      </div>
    </div>
  )
}
