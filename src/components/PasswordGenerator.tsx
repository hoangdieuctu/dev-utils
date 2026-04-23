import { useState, useCallback, useEffect } from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { RefreshIcon } from './Icons'
import { useLocalStorage } from '../hooks/useLocalStorage'

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const NUMBERS = '23456789'
const NUMBERS_FULL = '0123456789'
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?'
const AMBIGUOUS = new Set(['0', 'O', 'l', '1', 'I', 'i'])

function buildCharset(opts: Options): string {
  let chars = ''
  if (opts.lowercase) chars += opts.excludeAmbiguous ? LOWERCASE : 'abcdefghijklmnopqrstuvwxyz'
  if (opts.uppercase) chars += opts.excludeAmbiguous ? UPPERCASE : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (opts.numbers) chars += opts.excludeAmbiguous ? NUMBERS : NUMBERS_FULL
  if (opts.symbols) chars += SYMBOLS
  if (opts.excludeAmbiguous) chars = [...chars].filter(c => !AMBIGUOUS.has(c)).join('')
  return chars
}

function generatePassword(length: number, charset: string): string {
  if (!charset) return ''
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, n => charset[n % charset.length]).join('')
}

function calcEntropy(length: number, charsetSize: number): number {
  if (charsetSize === 0) return 0
  return length * Math.log2(charsetSize)
}

function strengthLabel(entropy: number): { label: string; color: string; width: string } {
  if (entropy < 28) return { label: 'Very Weak', color: 'var(--c-error)', width: '15%' }
  if (entropy < 40) return { label: 'Weak',      color: '#fb923c', width: '30%' }
  if (entropy < 60) return { label: 'Fair',      color: 'var(--c-warning)', width: '52%' }
  if (entropy < 80) return { label: 'Strong',    color: 'var(--c-success)', width: '75%' }
  return                   { label: 'Very Strong', color: 'var(--c-accent)', width: '100%' }
}

interface Options {
  lowercase: boolean
  uppercase: boolean
  numbers: boolean
  symbols: boolean
  excludeAmbiguous: boolean
}

function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className="w-4 h-4 rounded flex items-center justify-center transition-all duration-100 cursor-pointer flex-shrink-0"
        style={{
          background: checked ? 'var(--c-accent)' : 'transparent',
          border: `1.5px solid ${checked ? 'var(--c-accent)' : 'var(--c-border-strong)'}`,
        }}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-sm" style={{ color: checked ? 'var(--c-text)' : 'var(--c-text-2)' }}>{label}</span>
    </label>
  )
}

export function PasswordGenerator() {
  const [length, setLength] = useLocalStorage('devutils:password:length', 20)
  const [opts, setOpts] = useLocalStorage<Options>('devutils:password:opts', {
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
    excludeAmbiguous: false,
  })
  const [password, setPassword] = useState('')
  const { copied, copy } = useCopy()

  const charset = buildCharset(opts)

  const regen = useCallback(() => {
    setPassword(generatePassword(length, charset))
  }, [length, charset])

  useEffect(() => { regen() }, [regen])

  const entropy = calcEntropy(length, charset.length)
  const strength = strengthLabel(entropy)
  const hasCharset = charset.length > 0

  const setOpt = <K extends keyof Options>(k: K, v: Options[K]) =>
    setOpts(o => ({ ...o, [k]: v }))

  return (
    <div className="flex flex-col h-full gap-6 animate-fade-in">
      {/* Password display */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="section-label">Generated Password</span>
          <div className="flex items-center gap-2">
            <button onClick={regen} className="tool-btn flex items-center gap-1.5 text-xs">
              <RefreshIcon size={13} />
              Regenerate
            </button>
            <CopyButton text={password} copyKey="pw" copied={copied} onCopy={copy} />
          </div>
        </div>

        {hasCharset ? (
          <div
            className="font-mono text-lg tracking-wider break-all leading-relaxed select-all py-1"
            style={{ color: 'var(--c-text)', letterSpacing: '0.08em' }}
          >
            {password}
          </div>
        ) : (
          <div className="font-mono text-sm py-1" style={{ color: 'var(--c-text-3)' }}>
            Select at least one character type.
          </div>
        )}

        {/* Strength bar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-bg-overlay)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: hasCharset ? strength.width : '0%', background: strength.color }}
            />
          </div>
          <span className="text-xs font-mono flex-shrink-0" style={{ color: strength.color, minWidth: '70px', textAlign: 'right' }}>
            {hasCharset ? strength.label : '—'}
          </span>
          <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
            {hasCharset ? `${Math.round(entropy)} bits` : ''}
          </span>
        </div>
      </div>

      {/* Options */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}
      >
        <div className="mb-4">
          <span className="section-label">Options</span>
        </div>

        {/* Length slider */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--c-text-2)' }}>Length</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLength(l => Math.max(8, l - 1))}
                className="w-6 h-6 rounded flex items-center justify-center text-xs cursor-pointer transition-colors"
                style={{ border: '1px solid var(--c-border-strong)', background: 'var(--c-bg-elevated)', color: 'var(--c-text-2)' }}
              >−</button>
              <span
                className="font-mono text-sm w-8 text-center"
                style={{ color: 'var(--c-text)' }}
              >{length}</span>
              <button
                onClick={() => setLength(l => Math.min(64, l + 1))}
                className="w-6 h-6 rounded flex items-center justify-center text-xs cursor-pointer transition-colors"
                style={{ border: '1px solid var(--c-border-strong)', background: 'var(--c-bg-elevated)', color: 'var(--c-text-2)' }}
              >+</button>
            </div>
          </div>
          <input
            type="range"
            min={8}
            max={64}
            value={length}
            onChange={e => setLength(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--c-accent) ${((length - 8) / 56) * 100}%, var(--c-border) ${((length - 8) / 56) * 100}%)`,
              accentColor: 'var(--c-accent)',
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--c-text-4)' }}>8</span>
            <span className="text-xs font-mono" style={{ color: 'var(--c-text-4)' }}>64</span>
          </div>
        </div>

        {/* Checkboxes */}
        <div className="grid grid-cols-2 gap-3">
          <CheckOption label="Lowercase (a-z)" checked={opts.lowercase} onChange={v => setOpt('lowercase', v)} />
          <CheckOption label="Uppercase (A-Z)" checked={opts.uppercase} onChange={v => setOpt('uppercase', v)} />
          <CheckOption label="Numbers (0-9)"   checked={opts.numbers}   onChange={v => setOpt('numbers', v)} />
          <CheckOption label="Symbols (!@#…)"  checked={opts.symbols}   onChange={v => setOpt('symbols', v)} />
          <CheckOption label="Exclude ambiguous" checked={opts.excludeAmbiguous} onChange={v => setOpt('excludeAmbiguous', v)} />
        </div>
      </div>

      {/* Charset info */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
          {hasCharset
            ? `Charset: ${charset.length} characters · Generated with crypto.getRandomValues()`
            : 'No charset selected'}
        </span>
      </div>
    </div>
  )
}
