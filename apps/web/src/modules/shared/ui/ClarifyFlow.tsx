import { useState } from 'react'

export interface ClarifyQuestion {
  question: string
  options: { label: string; value: string }[]
}

export function parseClarifyBlocks(text: string): ClarifyQuestion[] {
  const blocks: ClarifyQuestion[] = []
  const segments = text.split(/\n{2,}/)

  for (const seg of segments) {
    const lines = seg.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) continue

    const optionRegex = /^([A-F])\.\s+(.+)$/
    const optLines = lines.filter(l => optionRegex.test(l))
    if (optLines.length < 2) continue

    const firstOptionIdx = lines.findIndex(l => optionRegex.test(l))
    const question = lines.slice(0, firstOptionIdx).join(' ').replace(/[?？]\s*$/, '').trim()
    if (!question) continue

    const options = optLines.map(l => {
      const m = l.match(optionRegex)!
      return { label: m[2], value: m[2] }
    })

    blocks.push({ question, options })
  }

  return blocks
}

export function stripClarifyBlocks(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter(seg => {
      const lines = seg.trim().split('\n').map(l => l.trim()).filter(Boolean)
      return lines.filter(l => /^[A-F]\.\s+/.test(l)).length < 2
    })
    .join('\n\n')
    .trim()
}

function isOtherOption(label: string) {
  return /^lainnya|^other/i.test(label)
}

function ClarifyBlock({
  question,
  options,
  onSelect,
}: {
  question: string
  options: { label: string; value: string }[]
  onSelect: (val: string) => void
}) {
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const submitCustom = () => {
    const v = customValue.trim()
    if (v) { onSelect(v); setCustomValue(''); setCustomMode(false) }
  }

  return (
    <div style={{ margin: '8px 0', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)' }}>
      <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4 }}>
        {question}?
      </p>
      {customMode ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            autoFocus
            value={customValue}
            onChange={e => setCustomValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitCustom(); if (e.key === 'Escape') setCustomMode(false) }}
            placeholder="Ketik jawabanmu…"
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.78rem', outline: 'none' }}
          />
          <button
            onClick={submitCustom}
            disabled={!customValue.trim()}
            style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', fontSize: '0.76rem', fontWeight: 600, cursor: customValue.trim() ? 'pointer' : 'default', opacity: customValue.trim() ? 1 : 0.5 }}
          >
            Kirim
          </button>
          <button
            onClick={() => setCustomMode(false)}
            style={{ padding: '5px 8px', borderRadius: 6, background: 'none', color: 'var(--fg-subtle)', border: '1px solid var(--border)', fontSize: '0.76rem', cursor: 'pointer' }}
          >
            Batal
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => isOtherOption(opt.label) ? setCustomMode(true) : onSelect(opt.value)}
              style={{
                textAlign: 'left', padding: '6px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: isOtherOption(opt.label) ? 'var(--fg-subtle)' : 'var(--fg)',
                fontSize: '0.78rem', cursor: 'pointer',
                fontStyle: isOtherOption(opt.label) ? 'italic' : 'normal',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ClarifyAnswered({ question, answer }: { question: string; answer: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '5px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)', opacity: 0.65 }}>
      <span style={{ fontSize: '0.74rem', color: 'var(--fg-subtle)', flex: 1 }}>{question}</span>
      <span style={{ fontSize: '0.74rem', color: 'var(--fg)', fontWeight: 600 }}>✓ {answer}</span>
    </div>
  )
}

/**
 * Sequential clarify flow — shows one question at a time.
 * Calls onComplete({ q1: answer1, q2: answer2, ... }) when all answered.
 */
export function ClarifyFlow({
  blocks,
  onComplete,
}: {
  blocks: ClarifyQuestion[]
  onComplete: (answers: Record<string, string>) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const answered = Object.keys(answers).length
  const current = blocks[answered]

  const handleAnswer = (question: string, value: string) => {
    const next = { ...answers, [question]: value }
    setAnswers(next)
    if (Object.keys(next).length >= blocks.length) {
      onComplete(next)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {blocks.slice(0, answered).map((b, i) => (
        <ClarifyAnswered key={i} question={b.question} answer={answers[b.question]} />
      ))}
      {current && (
        <ClarifyBlock
          question={current.question}
          options={current.options}
          onSelect={val => handleAnswer(current.question, val)}
        />
      )}
    </div>
  )
}
