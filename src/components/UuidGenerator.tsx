import { useState, useCallback } from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { RefreshIcon } from './Icons'
import { useLocalStorage } from '../hooks/useLocalStorage'

function generateUUIDs(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID())
}

export function UuidGenerator() {
  const [count, setCount] = useLocalStorage('devutils:uuid:count', 5)
  const [uuids, setUuids] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('devutils:uuid:count')
      const n = stored !== null ? Number(JSON.parse(stored)) : 5
      return generateUUIDs(Number.isFinite(n) ? n : 5)
    } catch {
      return generateUUIDs(5)
    }
  })
  const { copied, copy } = useCopy()

  const regenerate = useCallback(() => {
    setUuids(generateUUIDs(count))
  }, [count])

  const handleCountChange = useCallback((val: number) => {
    const clamped = Math.min(50, Math.max(1, val))
    setCount(clamped)
    setUuids(generateUUIDs(clamped))
  }, [])

  const allText = uuids.join('\n')

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg-elevated)' }}>
          <span className="text-xs font-mono pl-3" style={{ color: 'var(--c-text-3)' }}>Count</span>
          <div className="flex items-center">
            <button
              onClick={() => handleCountChange(count - 1)}
              disabled={count <= 1}
              className="px-2 py-1.5 disabled:opacity-30 cursor-pointer transition-colors"
              style={{ borderLeft: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={e => handleCountChange(parseInt(e.target.value) || 1)}
              className="w-12 text-center text-sm font-mono bg-transparent border-none outline-none py-1.5"
              style={{ color: 'var(--c-text)' }}
            />
            <button
              onClick={() => handleCountChange(count + 1)}
              disabled={count >= 50}
              className="px-2 py-1.5 disabled:opacity-30 cursor-pointer transition-colors"
              style={{ borderLeft: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8h8M8 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        <button onClick={regenerate} className="tool-btn-primary flex items-center gap-2">
          <RefreshIcon size={14} />
          Generate
        </button>

        <CopyButton
          text={allText}
          copyKey="all"
          copied={copied}
          onCopy={copy}
          label={`Copy all ${count}`}
        />
      </div>

      {/* UUID List */}
      <div className="flex-1 overflow-y-auto rounded-xl border" style={{ minHeight: 0, borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
        <div className="flex flex-col" style={{ borderColor: 'var(--c-border-subtle)' }}>
          {uuids.map((uuid, i) => (
            <div
              key={`${uuid}-${i}`}
              className="flex items-center justify-between px-4 py-3 group transition-colors duration-100"
              style={{ borderBottom: i < uuids.length - 1 ? '1px solid var(--c-border-subtle)' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg-elevated)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono w-6 text-right flex-shrink-0 select-none"
                  style={{ color: 'var(--c-text-3)' }}>
                  {i + 1}
                </span>
                <span className="font-mono text-sm truncate select-all" style={{ color: 'var(--c-text)', letterSpacing: '0.02em' }}>
                  {uuid}
                </span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-3">
                <CopyButton
                  text={uuid}
                  copyKey={uuid}
                  copied={copied}
                  onCopy={copy}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
          UUID v4 · crypto.randomUUID() · RFC 4122
        </span>
      </div>
    </div>
  )
}
