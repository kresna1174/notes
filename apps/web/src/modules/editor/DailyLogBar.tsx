import React, { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Plus } from 'lucide-react'

interface DailyLogBarProps {
  editor: Editor | null
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function DailyLogBar({ editor }: DailyLogBarProps) {
  const now = new Date()
  const [hour, setHour] = useState(pad(now.getHours()))
  const [minute, setMinute] = useState(pad(now.getMinutes()))
  const [activity, setActivity] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addEntry() {
    if (!editor || !activity.trim()) return
    const time = `${hour}:${minute}`
    const text = activity.trim()

    const urlRegex = /https?:\/\/[^\s]+/g
    const parts: Array<{ type: 'text'; text: string } | { type: 'text'; text: string; marks: { type: 'link'; attrs: { href: string; target: string } }[] }> = []
    let last = 0
    let match

    urlRegex.lastIndex = 0
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > last) {
        parts.push({ type: 'text', text: text.slice(last, match.index) })
      }
      parts.push({
        type: 'text',
        text: match[0],
        marks: [{ type: 'link', attrs: { href: match[0], target: '_blank' } }],
      })
      last = match.index + match[0].length
    }
    if (last < text.length) {
      parts.push({ type: 'text', text: text.slice(last) })
    }

    const content = [{ type: 'text', text: `${time} ` }, ...parts]

    editor
      .chain()
      .focus()
      .command(({ tr, state, dispatch }) => {
        const doc = state.doc
        let timelinePos: number | null = null

        doc.descendants((node, pos) => {
          if (node.type.name === 'heading' && node.attrs.level === 2) {
            const text = node.textContent
            if (text === 'Timeline') {
              timelinePos = pos + node.nodeSize
            }
          }
        })

        if (timelinePos === null) {
          return false
        }

        const listItemContent = state.schema.nodes.paragraph.create(null, content.map(c => {
          const textNode = state.schema.text(c.text)
          if ('marks' in c && c.marks && Array.isArray(c.marks)) {
            return textNode.mark((c.marks as { type: string; attrs: Record<string, unknown> }[]).map(m => state.schema.marks[m.type].create(m.attrs)))
          }
          return textNode
        }))

        const listItem = state.schema.nodes.listItem.create(null, listItemContent)

        const nodeAfter = doc.nodeAt(timelinePos)

        if (nodeAfter && nodeAfter.type.name === 'bulletList') {
          const listEnd = timelinePos + nodeAfter.nodeSize - 1
          if (dispatch) {
            tr.insert(listEnd, listItem)
            dispatch(tr)
          }
        } else {
          const bulletList = state.schema.nodes.bulletList.create(null, listItem)
          if (dispatch) {
            tr.insert(timelinePos, bulletList)
            dispatch(tr)
          }
        }

        return true
      })
      .run()

    setActivity('')
    inputRef.current?.focus()
  }

  const C = {
    fg: 'var(--fg)',
    fgMuted: 'var(--fg-muted)',
    border: 'var(--border)',
    primary: 'var(--primary)',
    accent: 'var(--accent)',
    bg: 'var(--bg)',
    muted: 'var(--muted)',
  }

  const selectStyle: React.CSSProperties = {
    padding: '5px 6px',
    fontSize: '0.8rem',
    fontFamily: 'var(--font-body)',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    background: C.bg,
    color: C.fg,
    cursor: 'pointer',
    outline: 'none',
    width: 54,
    textAlign: 'center',
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: C.muted,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.fgMuted, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
        + Add Activity
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <select
          value={hour}
          onChange={e => setHour(e.target.value)}
          style={selectStyle}
        >
          {Array.from({ length: 24 }, (_, i) => pad(i)).map(h => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span style={{ color: C.fgMuted, fontWeight: 700, fontSize: '0.85rem' }}>:</span>
        <select
          value={minute}
          onChange={e => setMinute(e.target.value)}
          style={selectStyle}
        >
          {Array.from({ length: 12 }, (_, i) => pad(i * 5)).map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={activity}
        onChange={e => setActivity(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addEntry() }}
        placeholder="Activity, or paste URL..."
        style={{
          flex: 1,
          minWidth: 160,
          padding: '5px 10px',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-body)',
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          background: C.bg,
          color: C.fg,
          outline: 'none',
        }}
      />
      <button
        onClick={addEntry}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 12px',
          fontSize: '0.78rem',
          fontWeight: 600,
          fontFamily: 'var(--font-body)',
          border: 'none',
          borderRadius: 6,
          background: C.primary,
          color: 'var(--primary-fg)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <Plus size={12} strokeWidth={2.5} /> Add
      </button>
    </div>
  )
}
