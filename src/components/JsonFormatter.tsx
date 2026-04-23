import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInputHistory } from '../hooks/useInputHistory'
import { InputHistory } from './InputHistory'

type Mode = 'format' | 'minify'

interface ParseResult {
  valid: boolean
  parsed: unknown
  output: string
  error: string | null
  lineNumber?: number
}

function parseJSON(input: string, mode: Mode): ParseResult {
  if (!input.trim()) return { valid: true, parsed: null, output: '', error: null }
  try {
    const parsed = JSON.parse(input)
    const output = mode === 'format'
      ? JSON.stringify(parsed, null, 2)
      : JSON.stringify(parsed)
    return { valid: true, parsed, output, error: null }
  } catch (e) {
    const err = e as SyntaxError
    const match = err.message.match(/position (\d+)/)
    const position = match ? parseInt(match[1]) : null
    let lineNumber: number | undefined
    if (position !== null) {
      lineNumber = input.slice(0, position).split('\n').length
    }
    return { valid: false, parsed: null, output: '', error: err.message, lineNumber }
  }
}

// ─── Token tree ────────────────────────────────────────────────────────────────

type TokenKind = 'open' | 'close' | 'primitive'

interface Token {
  kind: TokenKind
  path: string
  depth: number
  key: string | null
  valueType: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  closingBracket?: string
  commaAfter: boolean
  childCount: number
  primitiveValue?: string
}

function buildTokens(value: unknown, path: string, depth: number, key: string | null, commaAfter: boolean, out: Token[]) {
  if (Array.isArray(value)) {
    out.push({ kind: 'open', path, depth, key, valueType: 'array', closingBracket: ']', commaAfter, childCount: value.length })
    value.forEach((child, i) => buildTokens(child, `${path}[${i}]`, depth + 1, null, i < value.length - 1, out))
    out.push({ kind: 'close', path: `${path}/__close`, depth, key: null, valueType: 'array', commaAfter, childCount: 0 })
  } else if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    out.push({ kind: 'open', path, depth, key, valueType: 'object', closingBracket: '}', commaAfter, childCount: entries.length })
    entries.forEach(([k, v], i) => buildTokens(v, `${path}.${k}`, depth + 1, k, i < entries.length - 1, out))
    out.push({ kind: 'close', path: `${path}/__close`, depth, key: null, valueType: 'object', commaAfter, childCount: 0 })
  } else {
    let primitiveValue: string
    let valueType: Token['valueType']
    if (value === null) { primitiveValue = 'null'; valueType = 'null' }
    else if (typeof value === 'string') { primitiveValue = JSON.stringify(value); valueType = 'string' }
    else if (typeof value === 'number') { primitiveValue = String(value); valueType = 'number' }
    else if (typeof value === 'boolean') { primitiveValue = String(value); valueType = 'boolean' }
    else { primitiveValue = String(value); valueType = 'null' }
    out.push({ kind: 'primitive', path, depth, key, valueType, commaAfter, childCount: 0, primitiveValue })
  }
}

function getTokens(parsed: unknown): Token[] {
  const out: Token[] = []
  buildTokens(parsed, 'root', 0, null, false, out)
  return out
}

function applyCollapse(tokens: Token[], collapsed: Set<string>): Token[] {
  const visible: Token[] = []
  let suppressDepth: number | null = null
  for (const tok of tokens) {
    if (suppressDepth !== null) {
      if (tok.kind === 'close' && tok.depth === suppressDepth) suppressDepth = null
      continue
    }
    visible.push(tok)
    if (tok.kind === 'open' && collapsed.has(tok.path)) suppressDepth = tok.depth
  }
  return visible
}

function JsonTreeView({ parsed }: { parsed: unknown }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const tokens = useMemo(() => getTokens(parsed), [parsed])
  const visible = useMemo(() => applyCollapse(tokens, collapsed), [tokens, collapsed])

  const toggle = useCallback((path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    setCollapsed(new Set(tokens.filter(t => t.kind === 'open').map(t => t.path)))
  }, [tokens])

  const expandAll = useCallback(() => setCollapsed(new Set()), [])
  const collapsibleCount = tokens.filter(t => t.kind === 'open').length

  return (
    <div className="flex flex-col h-full min-h-0">
      {collapsibleCount > 0 && (
        <div className="flex items-center gap-2 pb-2 flex-shrink-0">
          <button onClick={expandAll} className="text-xs font-mono cursor-pointer transition-colors"
            style={{ color: 'var(--c-text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-text-2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-3)')}>
            Expand all
          </button>
          <span style={{ color: 'var(--c-text-4)' }}>·</span>
          <button onClick={collapseAll} className="text-xs font-mono cursor-pointer transition-colors"
            style={{ color: 'var(--c-text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-text-2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-3)')}>
            Collapse all
          </button>
        </div>
      )}

      <div className="code-view">
        <div className="py-2" style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace', fontSize: '12.5px', lineHeight: '1.7' }}>
          {visible.map((tok, idx) => {
            const isCollapsed = collapsed.has(tok.path)
            const isCollapsible = tok.kind === 'open'
            const indent = tok.depth * 16
            return (
              <div key={tok.path + (tok.kind === 'close' ? '__c' : '')}
                className="flex items-start group hover:bg-white/[0.02] transition-colors duration-75"
                style={{ minHeight: '1.7em' }}>
                <div className="flex-shrink-0 select-none text-right pr-3 pt-px"
                  style={{ color: 'var(--c-text-4)', minWidth: '42px', paddingLeft: '8px', userSelect: 'none' }}>
                  {idx + 1}
                </div>
                <div className="flex-shrink-0"
                  style={{ width: '16px', paddingTop: '2px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                  {isCollapsible && (
                    <button onClick={() => toggle(tok.path)}
                      className="cursor-pointer transition-colors duration-75 flex-shrink-0"
                      style={{ color: 'var(--c-text-3)', lineHeight: 1, padding: 0, background: 'none', border: 'none', marginTop: '2px' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                        style={{ transition: 'transform 0.1s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex-1 pr-4 select-text"
                  style={{ paddingLeft: `${indent}px`, paddingTop: '1px', whiteSpace: 'pre' }}>
                  {tok.kind === 'open' ? (
                    <>
                      {tok.key !== null && (<>
                        <span style={{ color: 'var(--c-accent-2)' }}>"{tok.key}"</span>
                        <span style={{ color: 'var(--c-text-3)' }}>: </span>
                      </>)}
                      <span style={{ color: 'var(--c-text)' }}>{tok.valueType === 'array' ? '[' : '{'}</span>
                      {isCollapsed && (<>
                        <span style={{ color: 'var(--c-text-3)' }}>
                          {tok.valueType === 'array'
                            ? ` … ${tok.childCount} item${tok.childCount !== 1 ? 's' : ''} `
                            : ` … ${tok.childCount} key${tok.childCount !== 1 ? 's' : ''} `}
                        </span>
                        <span style={{ color: 'var(--c-text)' }}>{tok.closingBracket}</span>
                        {tok.commaAfter && <span style={{ color: 'var(--c-text-3)' }}>,</span>}
                      </>)}
                    </>
                  ) : tok.kind === 'close' ? (
                    <>
                      <span style={{ color: 'var(--c-text)' }}>{tok.valueType === 'array' ? ']' : '}'}</span>
                      {tok.commaAfter && <span style={{ color: 'var(--c-text-3)' }}>,</span>}
                    </>
                  ) : (
                    <>
                      {tok.key !== null && (<>
                        <span style={{ color: 'var(--c-accent-2)' }}>"{tok.key}"</span>
                        <span style={{ color: 'var(--c-text-3)' }}>: </span>
                      </>)}
                      <span style={{ color: tok.valueType === 'string' ? 'var(--c-success)' : tok.valueType === 'number' ? 'var(--c-warning)' : tok.valueType === 'boolean' ? 'var(--c-keyword)' : 'var(--c-text-2)' }}>
                        {tok.primitiveValue}
                      </span>
                      {tok.commaAfter && <span style={{ color: 'var(--c-text-3)' }}>,</span>}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function JsonFormatter() {
  const [input, setInput] = useLocalStorage('devutils:json:input', '')
  const [mode, setMode] = useLocalStorage<Mode>('devutils:json:mode', 'format')
  const { copied, copy } = useCopy()
  const { history, pushHistory, clearHistory } = useInputHistory('devutils:json:history')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const result = parseJSON(input, mode)
  const handleClear = useCallback(() => setInput(''), [])
  const lineCount = input.split('\n').length
  const outputLineCount = result.output ? result.output.split('\n').length : 0

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!input.trim() || !result.valid) return
    timerRef.current = setTimeout(() => pushHistory(input), 400)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [input, result.valid])

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
            {(['format', 'minify'] as Mode[]).map((m, i) => (
              <button key={m} onClick={() => setMode(m)}
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
          {input && (
            result.valid
              ? <span className="badge-success">✓ Valid JSON</span>
              : <span className="badge-error">✗ Invalid{result.lineNumber ? ` — line ${result.lineNumber}` : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result.output && <CopyButton text={result.output} copyKey="output" copied={copied} onCopy={copy} />}
          {input && <button onClick={handleClear} className="tool-btn text-xs">Clear</button>}
        </div>
      </div>

      {!result.valid && result.error && <div className="error-block">{result.error}</div>}

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex flex-col flex-1 gap-2 min-h-0">
          <div className="flex items-center justify-between">
            <span className="section-label">Input</span>
            <div className="flex items-center gap-2">
              <InputHistory history={history} onSelect={setInput} onClear={clearHistory} />
              <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
                {lineCount} {lineCount === 1 ? 'line' : 'lines'}
              </span>
            </div>
          </div>
          <textarea className="tool-textarea flex-1"
            placeholder={'{\n  "paste": "your JSON here",\n  "or": "start typing..."\n}'}
            value={input} onChange={e => setInput(e.target.value)}
            spellCheck={false} autoComplete="off" style={{ minHeight: 0 }} />
        </div>

        <div className="flex items-center justify-center w-8 flex-shrink-0">
          <div className="flex flex-col items-center gap-2 h-full">
            <div className="w-px flex-1 panel-divider" />
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--c-text-3)', flexShrink: 0 }}>
              <path d="M4 8h8M9 5l3 3-3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="w-px flex-1 panel-divider" />
          </div>
        </div>

        <div className="flex flex-col flex-1 gap-2 min-h-0">
          <div className="flex items-center justify-between">
            <span className="section-label">Output</span>
            {outputLineCount > 0 && (
              <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
                {outputLineCount} {outputLineCount === 1 ? 'line' : 'lines'}
              </span>
            )}
          </div>
          {result.valid && result.parsed !== null && mode === 'format' ? (
            <JsonTreeView parsed={result.parsed} />
          ) : (
            <textarea className="tool-textarea flex-1" placeholder="Formatted JSON appears here..."
              value={result.output} readOnly spellCheck={false}
              style={{ minHeight: 0, color: result.valid && result.output ? 'var(--c-text)' : 'var(--c-text-3)' }} />
          )}
        </div>
      </div>
    </div>
  )
}
