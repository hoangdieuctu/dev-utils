import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { format, type SqlLanguage } from 'sql-formatter'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInputHistory } from '../hooks/useInputHistory'
import { InputHistory } from './InputHistory'

const DIALECTS: { id: SqlLanguage; label: string }[] = [
  { id: 'sql',        label: 'SQL' },
  { id: 'mysql',      label: 'MySQL' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'sqlite',     label: 'SQLite' },
  { id: 'bigquery',   label: 'BigQuery' },
  { id: 'tsql',       label: 'T-SQL' },
  { id: 'plsql',      label: 'PL/SQL' },
]

const INDENT_OPTIONS = [2, 4] as const
type IndentSize = typeof INDENT_OPTIONS[number]

const KEYWORD_CASES = ['upper', 'lower', 'preserve'] as const
type KeywordCase = typeof KEYWORD_CASES[number]

interface FormatResult {
  ok: boolean
  output: string
  error: string | null
}

function runFormat(sql: string, dialect: SqlLanguage, indent: IndentSize, keywordCase: KeywordCase): FormatResult {
  if (!sql.trim()) return { ok: true, output: '', error: null }
  try {
    // Replace :named_params with unique placeholders so sql-formatter doesn't
    // mangle them (it drops the space before params and breaks on keywords like :end).
    const params: string[] = []
    const placeholder = '__PARAM_'
    const sanitized = sql.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
      params.push(match)
      return `${placeholder}${params.length - 1}__`
    })

    let output = format(sanitized, {
      language: dialect,
      tabWidth: indent,
      keywordCase,
      linesBetweenQueries: 2,
    })

    // Restore original :named_params, preserving the keyword case of the surrounding text
    output = output.replace(new RegExp(`${placeholder}(\\d+)__`, 'g'), (_, i) => params[Number(i)])

    return { ok: true, output, error: null }
  } catch (e) {
    const msg = (e as Error).message
    // EOF errors always mean incomplete input (trailing dot, unclosed paren/string).
    if (msg.includes('«EOF»')) return { ok: false, output: '', error: null }
    return { ok: false, output: '', error: msg }
  }
}

// Join each top-level keyword line with its first indented child so clauses
// stay on one line: "from\n  users u" → "from users u"
function flattenClauses(sql: string): string {
  const lines = sql.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      const children: string[] = []
      while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
        i++
        children.push(lines[i].trimStart())
      }
      if (children.length > 0) {
        out.push(line + ' ' + children[0])
        for (let j = 1; j < children.length; j++) out.push(children[j])
      } else {
        out.push(line)
      }
    } else {
      out.push(line)
    }
    i++
  }
  return out.join('\n')
}

const KEYWORDS = new Set(
  'SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS ON AS AND OR NOT IN EXISTS BETWEEN LIKE IS NULL CASE WHEN THEN ELSE END INSERT INTO VALUES UPDATE SET DELETE CREATE ALTER DROP TABLE INDEX VIEW DATABASE SCHEMA WITH UNION ALL DISTINCT ORDER BY GROUP HAVING LIMIT OFFSET ASC DESC PRIMARY KEY FOREIGN REFERENCES CONSTRAINT DEFAULT UNIQUE CHECK IF BEGIN COMMIT ROLLBACK TRANSACTION OVER PARTITION RETURNING EXPLAIN ANALYZE TRUNCATE REPLACE USING'.split(' ')
)

const TOKEN_RE = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`|--[^\n]*|\/\*[\s\S]*?\*\/|\b\d+(?:\.\d+)?\b|:[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*|\S)/g

interface Span { text: string; color: string }

function tokenColor(token: string): string {
  if (token.startsWith('--') || token.startsWith('/*')) return 'var(--c-text-5)'
  if (token.startsWith("'") || token.startsWith('"') || token.startsWith('`')) return 'var(--c-success)'
  if (token.startsWith(':')) return 'var(--c-warning)'
  if (/^\d/.test(token)) return 'var(--c-warning)'
  if (KEYWORDS.has(token.toUpperCase())) return 'var(--c-keyword)'
  if (/^[(),;.*=<>!+\-/%&|^~]/.test(token)) return 'var(--c-text-2)'
  return 'var(--c-text)'
}

function highlight(sql: string): Span[] {
  const spans: Span[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0

  while ((m = TOKEN_RE.exec(sql)) !== null) {
    if (m.index > last) {
      spans.push({ text: sql.slice(last, m.index), color: 'var(--c-text)' })
    }
    spans.push({ text: m[0], color: tokenColor(m[0]) })
    last = m.index + m[0].length
  }
  if (last < sql.length) spans.push({ text: sql.slice(last), color: 'var(--c-text)' })
  return spans
}

function SqlOutput({ sql }: { sql: string }) {
  const lineSpans = useMemo((): Span[][] => {
    const spans = highlight(sql)
    const result: Span[][] = [[]]
    for (const span of spans) {
      const parts = span.text.split('\n')
      parts.forEach((part, i) => {
        if (i > 0) result.push([])
        if (part) result[result.length - 1].push({ text: part, color: span.color })
      })
    }
    return result
  }, [sql])

  return (
    <div className="code-view flex-1" style={{ minHeight: 0 }}>
      <div
        className="py-2"
        style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace', fontSize: '12.5px', lineHeight: '1.7' }}
      >
        {lineSpans.map((spans, idx) => (
          <div
            key={idx}
            className="flex items-start hover:bg-white/[0.02] transition-colors duration-75"
          >
            <div
              className="flex-shrink-0 select-none text-right pr-3 pt-px"
              style={{ color: 'var(--c-text-4)', minWidth: '42px', paddingLeft: '8px' }}
            >
              {idx + 1}
            </div>
            <div className="flex-1 pr-4 select-text" style={{ paddingTop: '1px', whiteSpace: 'pre' }}>
              {spans.length > 0
                ? spans.map((s, si) => <span key={si} style={{ color: s.color }}>{s.text}</span>)
                : <span> </span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SqlFormatter() {
  const [input, setInput] = useLocalStorage('devutils:sql:input', '')
  const [dialect, setDialect] = useLocalStorage<SqlLanguage>('devutils:sql:dialect', 'sql')
  const [indent, setIndent] = useLocalStorage<IndentSize>('devutils:sql:indent', 2)
  const [keywordCase, setKeywordCase] = useLocalStorage<KeywordCase>('devutils:sql:keywordCase', 'upper')
  const [singleLine, setSingleLine] = useLocalStorage('devutils:sql:singleLine', false)
  const { copied, copy } = useCopy()
  const { history, pushHistory, clearHistory } = useInputHistory('devutils:sql:history')

  const [goodOutput, setGoodOutput] = useState('')
  const [visibleError, setVisibleError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!input.trim()) {
      setGoodOutput('')
      setVisibleError(null)
      setPending(false)
      return
    }

    setPending(true)
    timerRef.current = setTimeout(() => {
      const res = runFormat(input, dialect, indent, keywordCase)
      if (res.ok) {
        setGoodOutput(flattenClauses(res.output))
        setVisibleError(null)
        pushHistory(input)
      } else {
        setVisibleError(res.error)
      }
      setPending(false)
    }, 400)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [input, dialect, indent, keywordCase])

  const handleClear = useCallback(() => {
    setInput('')
    setGoodOutput('')
    setVisibleError(null)
    setPending(false)
  }, [])

  const displayOutput = singleLine
    ? goodOutput.replace(/\s+/g, ' ').trim()
    : goodOutput

  const inputLineCount = input.split('\n').length
  const outputLineCount = displayOutput ? displayOutput.split('\n').length : 0

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Dialect */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
          <button
            onClick={() => setDialect(DIALECTS[0].id)}
            className="px-3 py-1.5 text-xs font-mono font-medium transition-all duration-100 cursor-pointer"
            style={{
              background: dialect === DIALECTS[0].id ? 'var(--c-accent)' : 'var(--c-bg-elevated)',
              color: dialect === DIALECTS[0].id ? 'white' : 'var(--c-text-2)',
            }}
          >
            {DIALECTS[0].label}
          </button>
          {DIALECTS.slice(1).map(d => (
            <button
              key={d.id}
              onClick={() => setDialect(d.id)}
              className="px-3 py-1.5 text-xs font-mono font-medium transition-all duration-100 cursor-pointer"
              style={{
                background: dialect === d.id ? 'var(--c-accent)' : 'var(--c-bg-elevated)',
                color: dialect === d.id ? 'white' : 'var(--c-text-2)',
                borderLeft: '1px solid var(--c-border)',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Indent */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
          {INDENT_OPTIONS.map((n, i) => (
            <button
              key={n}
              onClick={() => setIndent(n)}
              className="px-3 py-1.5 text-xs font-mono font-medium transition-all duration-100 cursor-pointer"
              style={{
                background: indent === n ? 'var(--c-accent)' : 'var(--c-bg-elevated)',
                color: indent === n ? 'white' : 'var(--c-text-2)',
                borderLeft: i > 0 ? '1px solid var(--c-border)' : 'none',
              }}
            >
              {n}sp
            </button>
          ))}
        </div>

        {/* Keyword case */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
          {KEYWORD_CASES.map((k, i) => (
            <button
              key={k}
              onClick={() => setKeywordCase(k)}
              className="px-3 py-1.5 text-xs font-mono font-medium transition-all duration-100 cursor-pointer"
              style={{
                background: keywordCase === k ? 'var(--c-accent)' : 'var(--c-bg-elevated)',
                color: keywordCase === k ? 'white' : 'var(--c-text-2)',
                borderLeft: i > 0 ? '1px solid var(--c-border)' : 'none',
              }}
            >
              {k === 'upper' ? 'UPPER' : k === 'lower' ? 'lower' : 'Preserve'}
            </button>
          ))}
        </div>

        {/* Single-line toggle */}
        <button
          onClick={() => setSingleLine(s => !s)}
          className="px-3 py-1.5 text-xs font-mono font-medium transition-all duration-100 cursor-pointer rounded-lg"
          style={{
            background: singleLine ? 'var(--c-accent)' : 'var(--c-bg-elevated)',
            color: singleLine ? 'white' : 'var(--c-text-2)',
            border: `1px solid ${singleLine ? 'var(--c-accent)' : 'var(--c-border)'}`,
          }}
        >
          Single line
        </button>

        {/* Status + actions */}
        <div className="flex items-center gap-2 ml-auto">
          {pending && input && (
            <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>formatting…</span>
          )}
          {!pending && input && !visibleError && goodOutput && (
            <span className="badge-success">✓ Formatted</span>
          )}
          {displayOutput && (
            <CopyButton text={displayOutput} copyKey="sql-out" copied={copied} onCopy={copy} />
          )}
          {input && (
            <button onClick={handleClear} className="tool-btn text-xs">Clear</button>
          )}
        </div>
      </div>

      {/* Error */}
      {visibleError && !pending && (
        <div className="error-block">{visibleError}</div>
      )}

      {/* Two-panel layout */}
      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex flex-col flex-1 gap-2 min-h-0">
          <div className="flex items-center justify-between">
            <span className="section-label">Input</span>
            <div className="flex items-center gap-2">
              <InputHistory history={history} onSelect={setInput} onClear={clearHistory} />
              <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
                {inputLineCount} {inputLineCount === 1 ? 'line' : 'lines'}
              </span>
            </div>
          </div>
          <textarea
            className="tool-textarea flex-1"
            placeholder={'SELECT u.id, u.name, COUNT(o.id) AS order_count\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nWHERE u.created_at > \'2024-01-01\'\nGROUP BY u.id\nORDER BY order_count DESC;'}
            value={input}
            onChange={e => setInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            style={{ minHeight: 0 }}
          />
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

          {displayOutput ? (
            <SqlOutput sql={displayOutput} />
          ) : (
            <textarea
              className="tool-textarea flex-1"
              placeholder="Formatted SQL appears here..."
              readOnly
              spellCheck={false}
              style={{ minHeight: 0, color: 'var(--c-text-3)' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
