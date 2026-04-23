import { useState, useEffect, useRef } from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { md5, sha1, sha256, sha512 } from '../lib/hash'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInputHistory } from '../hooks/useInputHistory'
import { InputHistory } from './InputHistory'

interface HashResult {
  label: string
  key: string
  value: string
  bits: number
}

const ALGOS: { label: string; key: string; bits: number }[] = [
  { label: 'MD5', key: 'md5', bits: 128 },
  { label: 'SHA-1', key: 'sha1', bits: 160 },
  { label: 'SHA-256', key: 'sha256', bits: 256 },
  { label: 'SHA-512', key: 'sha512', bits: 512 },
]

async function computeHashes(input: string): Promise<HashResult[]> {
  if (!input) {
    return ALGOS.map(a => ({ ...a, value: '' }))
  }
  const [md5val, sha1val, sha256val, sha512val] = await Promise.all([
    Promise.resolve(md5(input)),
    sha1(input),
    sha256(input),
    sha512(input),
  ])
  const vals = [md5val, sha1val, sha256val, sha512val]
  return ALGOS.map((a, i) => ({ ...a, value: vals[i] }))
}

export function HashGenerator() {
  const [input, setInput] = useLocalStorage('devutils:hash:input', '')
  const [uppercase, setUppercase] = useLocalStorage('devutils:hash:uppercase', false)
  const [hashes, setHashes] = useState<HashResult[]>(ALGOS.map(a => ({ ...a, value: '' })))
  const { copied, copy } = useCopy()
  const { history, pushHistory, clearHistory } = useInputHistory('devutils:hash:history')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    computeHashes(input).then(results => {
      if (!cancelled) setHashes(results)
    })
    return () => { cancelled = true }
  }, [input])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!input.trim()) return
    timerRef.current = setTimeout(() => pushHistory(input), 400)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [input])

  const displayValue = (val: string) => uppercase ? val.toUpperCase() : val

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="section-label">Input Text</span>
          <div className="flex items-center gap-3">
            <InputHistory history={history} onSelect={setInput} onClear={clearHistory} />
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setUppercase(u => !u)}
                className="relative w-8 h-4 rounded-full transition-colors duration-200 cursor-pointer"
                style={{ background: uppercase ? 'var(--c-accent)' : 'var(--c-border)' }}
              >
                <div
                  className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200"
                  style={{ left: uppercase ? '18px' : '2px' }}
                />
              </div>
              <span className="text-xs font-mono" style={{ color: 'var(--c-text-2)' }}>UPPERCASE</span>
            </label>
          </div>
        </div>
        <textarea
          className="tool-textarea"
          rows={4}
          placeholder="Type or paste text to hash..."
          value={input}
          onChange={e => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {hashes.map(hash => (
          <div
            key={hash.key}
            className="rounded-xl border overflow-hidden transition-colors"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-text)' }}>
                  {hash.label}
                </span>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--c-text-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                  {hash.bits} bits
                </span>
              </div>
              <CopyButton
                text={hash.value ? displayValue(hash.value) : ''}
                copyKey={hash.key}
                copied={copied}
                onCopy={copy}
              />
            </div>

            <div className="px-4 py-3">
              {hash.value ? (
                <code
                  className="font-mono text-xs break-all leading-relaxed select-all block"
                  style={{ color: 'var(--c-accent-2)', wordBreak: 'break-all' }}
                >
                  {displayValue(hash.value)}
                </code>
              ) : (
                <span className="font-mono text-xs" style={{ color: 'var(--c-text-3)' }}>
                  {input ? 'Computing...' : '— enter text above to compute —'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
