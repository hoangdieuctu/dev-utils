import { useState, useEffect, useRef } from 'react'

interface InputHistoryProps {
  history: string[]
  onSelect: (value: string) => void
  onClear: () => void
}

export function InputHistory({ history, onSelect, onClear }: InputHistoryProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (history.length === 0) return null

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-mono cursor-pointer transition-colors px-2 py-1 rounded"
        style={{
          color: open ? 'var(--c-text-2)' : 'var(--c-text-4)',
          background: open ? 'var(--c-bg-elevated)' : 'transparent',
          border: '1px solid ' + (open ? 'var(--c-border)' : 'transparent'),
        }}
        onMouseEnter={e => {
          if (!open) (e.currentTarget as HTMLElement).style.color = 'var(--c-text-2)'
        }}
        onMouseLeave={e => {
          if (!open) (e.currentTarget as HTMLElement).style.color = 'var(--c-text-4)'
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Recent ({history.length})
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none"
          style={{ transition: 'transform 0.1s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 rounded-lg border overflow-hidden"
          style={{
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '280px',
            maxWidth: '480px',
            borderColor: 'var(--c-border)',
            background: 'var(--c-bg-surface)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}
          >
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>
              Recent
            </span>
            <button
              onClick={() => { onClear(); setOpen(false) }}
              className="text-xs font-mono cursor-pointer transition-colors"
              style={{ color: 'var(--c-text-4)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-error)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-4)')}
            >
              Clear all
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
            {history.map((entry, i) => (
              <button
                key={i}
                onClick={() => { onSelect(entry); setOpen(false) }}
                title={entry}
                className="w-full text-left px-3 py-2 text-xs font-mono truncate cursor-pointer transition-colors duration-75"
                style={{
                  color: 'var(--c-text-2)',
                  borderBottom: i < history.length - 1 ? '1px solid var(--c-border-subtle)' : 'none',
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-elevated)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--c-text)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--c-text-2)'
                }}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
