import { useState, useCallback, useEffect, useRef } from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInputHistory } from '../hooks/useInputHistory'
import { InputHistory } from './InputHistory'

type Mode = 'encode' | 'decode'

function encodeBase64(input: string): { result: string; error: string | null } {
  try { return { result: btoa(unescape(encodeURIComponent(input))), error: null } }
  catch { return { result: '', error: 'Encoding failed' } }
}

function decodeBase64(input: string): { result: string; error: string | null } {
  if (!input.trim()) return { result: '', error: null }
  try { return { result: decodeURIComponent(escape(atob(input.trim()))), error: null } }
  catch { return { result: '', error: 'Invalid Base64 string — cannot decode' } }
}

export function Base64Tool() {
  const [input, setInput] = useLocalStorage('devutils:base64:input', '')
  const [mode, setMode] = useLocalStorage<Mode>('devutils:base64:mode', 'encode')
  const { copied, copy } = useCopy()
  const { history, pushHistory, clearHistory } = useInputHistory('devutils:base64:history')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!input.trim()) return
    timerRef.current = setTimeout(() => pushHistory(input), 400)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [input])

  const handleInput = useCallback((val: string) => setInput(val), [])
  const processed = mode === 'encode' ? encodeBase64(input) : decodeBase64(input)
  const hasError = !!processed.error && input.trim().length > 0

  const swap = useCallback(() => {
    if (processed.result) {
      setInput(processed.result)
      setMode(m => m === 'encode' ? 'decode' : 'encode')
    }
  }, [processed.result])

  const inputLabel = mode === 'encode' ? 'Plain Text' : 'Base64 String'
  const outputLabel = mode === 'encode' ? 'Base64 Encoded' : 'Decoded Text'

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
          {(['encode', 'decode'] as Mode[]).map((m, i) => (
            <button key={m} onClick={() => { setMode(m); setInput('') }}
              className="px-3 py-1.5 text-xs font-mono font-medium transition-all duration-100 cursor-pointer"
              style={{
                background: mode === m ? 'var(--c-accent)' : 'var(--c-bg-elevated)',
                color: mode === m ? 'white' : 'var(--c-text-2)',
                borderLeft: i > 0 ? '1px solid var(--c-border)' : 'none',
              }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        {processed.result && !hasError && (
          <button onClick={swap}
            className="flex items-center gap-1.5 text-xs font-mono cursor-pointer px-2.5 py-1.5 rounded-md transition-all duration-150"
            style={{ color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--c-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-elevated)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--c-text-2)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 5h12M2 11h12M11 2l3 3-3 3M5 8l-3 3 3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Swap
          </button>
        )}
        {hasError && <span className="badge-error">✗ {processed.error}</span>}
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex flex-col flex-1 gap-2 min-h-0">
          <div className="flex items-center justify-between">
            <span className="section-label">{inputLabel}</span>
            <div className="flex items-center gap-2">
              {input && <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{input.length} chars</span>}
              <InputHistory history={history} onSelect={setInput} onClear={clearHistory} />
            </div>
          </div>
          <textarea className="tool-textarea flex-1"
            placeholder={mode === 'encode' ? 'Enter plain text to encode...' : 'Paste Base64 string to decode...'}
            value={input} onChange={e => handleInput(e.target.value)} spellCheck={false} style={{ minHeight: 0 }} />
        </div>

        <div className="flex items-center justify-center w-8 flex-shrink-0">
          <div className="flex flex-col items-center gap-2">
            <div className="w-px flex-1 panel-divider" />
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--c-text-3)' }}>
              <path d="M4 8h8M9 5l3 3-3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="w-px flex-1 panel-divider" />
          </div>
        </div>

        <div className="flex flex-col flex-1 gap-2 min-h-0">
          <div className="flex items-center justify-between">
            <span className="section-label">{outputLabel}</span>
            <div className="flex items-center gap-2">
              {processed.result && <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{processed.result.length} chars</span>}
              <CopyButton text={processed.result} copyKey="output" copied={copied} onCopy={copy} />
            </div>
          </div>
          <textarea className="tool-textarea flex-1"
            placeholder={mode === 'encode' ? 'Base64 output appears here...' : 'Decoded text appears here...'}
            value={hasError ? '' : processed.result} readOnly spellCheck={false}
            style={{ minHeight: 0, color: processed.result && !hasError ? 'var(--c-text)' : 'var(--c-text-3)' }} />
        </div>
      </div>
    </div>
  )
}
