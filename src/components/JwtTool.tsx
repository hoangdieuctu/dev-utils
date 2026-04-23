import { useMemo, useEffect, useRef } from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInputHistory } from '../hooks/useInputHistory'
import { InputHistory } from './InputHistory'

function base64urlDecode(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)
  return atob(padded)
}

function tryParseJson(raw: string): { ok: true; parsed: unknown; pretty: string } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw)
    return { ok: true, parsed, pretty: JSON.stringify(parsed, null, 2) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

interface JwtParts {
  header: { raw: string; json: string; parsed: Record<string, unknown> }
  payload: { raw: string; json: string; parsed: Record<string, unknown> }
  signature: string
}

function parseJwt(token: string): { ok: true; parts: JwtParts } | { ok: false; error: string } {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return { ok: false, error: `Invalid JWT: expected 3 parts separated by '.', got ${parts.length}` }
  }

  let headerRaw: string
  let payloadRaw: string
  try {
    headerRaw = base64urlDecode(parts[0])
    payloadRaw = base64urlDecode(parts[1])
  } catch {
    return { ok: false, error: 'Failed to base64url-decode JWT segments' }
  }

  const headerResult = tryParseJson(headerRaw)
  const payloadResult = tryParseJson(payloadRaw)

  if (!headerResult.ok) return { ok: false, error: `Invalid header JSON: ${headerResult.error}` }
  if (!payloadResult.ok) return { ok: false, error: `Invalid payload JSON: ${payloadResult.error}` }

  return {
    ok: true,
    parts: {
      header: { raw: headerRaw, json: headerResult.pretty, parsed: headerResult.parsed as Record<string, unknown> },
      payload: { raw: payloadRaw, json: payloadResult.pretty, parsed: payloadResult.parsed as Record<string, unknown> },
      signature: parts[2],
    },
  }
}

function formatTs(ts: unknown): string {
  if (typeof ts !== 'number') return String(ts)
  const d = new Date(ts * 1000)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) + ` (${ts})`
}

function ExpiryBadge({ exp }: { exp: unknown }) {
  if (typeof exp !== 'number') return null
  const now = Math.floor(Date.now() / 1000)
  const diff = exp - now

  if (diff < 0) {
    const ago = Math.abs(diff)
    const label = ago > 3600 ? `${Math.round(ago / 3600)}h ago` : ago > 60 ? `${Math.round(ago / 60)}m ago` : `${ago}s ago`
    return (
      <span className="badge-error ml-2">Expired {label}</span>
    )
  }

  const label = diff > 86400 ? `${Math.round(diff / 86400)}d` : diff > 3600 ? `${Math.round(diff / 3600)}h` : diff > 60 ? `${Math.round(diff / 60)}m` : `${diff}s`
  return (
    <span className="badge-success ml-2">Valid · expires in {label}</span>
  )
}

const CLAIM_LABELS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires',
  iat: 'Issued At',
  nbf: 'Not Before',
  jti: 'JWT ID',
}

const TS_CLAIMS = new Set(['exp', 'iat', 'nbf'])

function ClaimsTable({ payload }: { payload: Record<string, unknown> }) {
  const known = Object.entries(CLAIM_LABELS).filter(([k]) => k in payload)
  const other = Object.entries(payload).filter(([k]) => !(k in CLAIM_LABELS))

  if (known.length === 0 && other.length === 0) return null

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
      <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
        <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-text)' }}>Claims</span>
        {payload.exp !== undefined && <ExpiryBadge exp={payload.exp} />}
      </div>
      <table className="w-full text-xs font-mono">
        <tbody>
          {known.map(([k, label]) => (
            <tr key={k} className="border-b" style={{ borderColor: 'var(--c-border-subtle)' }}>
              <td className="px-4 py-2 w-28 flex-shrink-0 font-medium" style={{ color: 'var(--c-accent-2)' }}>{k}</td>
              <td className="px-4 py-2" style={{ color: 'var(--c-text-2)' }}>{label}</td>
              <td className="px-4 py-2 break-all" style={{ color: 'var(--c-text)' }}>
                {TS_CLAIMS.has(k) ? formatTs(payload[k]) : String(payload[k])}
              </td>
            </tr>
          ))}
          {other.map(([k, v]) => (
            <tr key={k} className="border-b last:border-0" style={{ borderColor: 'var(--c-border-subtle)' }}>
              <td className="px-4 py-2 w-28" style={{ color: 'var(--c-text-2)' }}>{k}</td>
              <td className="px-4 py-2" style={{ color: 'var(--c-text-3)' }}>Custom</td>
              <td className="px-4 py-2 break-all" style={{ color: 'var(--c-text)' }}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ColoredToken({ token }: { token: string }) {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  return (
    <div
      className="font-mono text-xs break-all rounded-lg px-4 py-3 border leading-relaxed select-all"
      style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-code)' }}
    >
      <span style={{ color: 'var(--c-accent-2)' }}>{parts[0]}</span>
      <span style={{ color: 'var(--c-text-3)' }}>.</span>
      <span style={{ color: 'var(--c-purple)' }}>{parts[1]}</span>
      <span style={{ color: 'var(--c-text-3)' }}>.</span>
      <span style={{ color: 'var(--c-text-5)' }}>{parts[2]}</span>
    </div>
  )
}

const SAMPLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

export function JwtTool() {
  const [token, setToken] = useLocalStorage('devutils:jwt:token', '')
  const { copied, copy } = useCopy()
  const { history, pushHistory, clearHistory } = useInputHistory('devutils:jwt:history')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const result = useMemo(() => {
    if (!token.trim()) return null
    return parseJwt(token)
  }, [token])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!token.trim() || !result?.ok) return
    timerRef.current = setTimeout(() => pushHistory(token), 400)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [token, result?.ok])

  const isValid = result?.ok === true

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in" style={{ overflowY: 'auto' }}>
      {/* Input */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="section-label">JWT Token</span>
          <div className="flex items-center gap-2">
            <InputHistory history={history} onSelect={setToken} onClear={clearHistory} />
            {token && (
              <button onClick={() => setToken('')} className="tool-btn text-xs">Clear</button>
            )}
            <button onClick={() => setToken(SAMPLE_JWT)} className="tool-btn text-xs">Load sample</button>
            <CopyButton text={token} copyKey="token" copied={copied} onCopy={copy} label="Copy token" />
          </div>
        </div>
        <textarea
          className="tool-textarea"
          rows={4}
          placeholder="Paste a JWT token (eyJ…)"
          value={token}
          onChange={e => setToken(e.target.value)}
          spellCheck={false}
          style={{ wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}
        />
      </div>

      {/* Error state */}
      {result && !result.ok && (
        <div className="error-block flex-shrink-0">{result.error}</div>
      )}

      {/* Color-coded token */}
      {isValid && result.ok && (
        <div className="flex-shrink-0">
          <div className="flex items-center gap-4 mb-2">
            <span className="section-label">Encoded</span>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span style={{ color: 'var(--c-accent-2)' }}>■ Header</span>
              <span style={{ color: 'var(--c-purple)' }}>■ Payload</span>
              <span style={{ color: 'var(--c-text-5)' }}>■ Signature</span>
            </div>
          </div>
          <ColoredToken token={token.trim()} />
        </div>
      )}

      {/* Decoded panels */}
      {isValid && result.ok && (
        <div className="flex flex-col gap-3 flex-shrink-0">
          <ClaimsTable payload={result.parts.payload.parsed} />

          <div className="flex gap-3">
            {/* Header */}
            <div className="flex-1 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-accent-2)' }}>Header</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--c-text-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                    {result.parts.header.parsed.alg as string ?? '—'}
                  </span>
                </div>
                <CopyButton text={result.parts.header.json} copyKey="header" copied={copied} onCopy={copy} />
              </div>
              <pre className="px-4 py-3 text-xs font-mono overflow-x-auto" style={{ color: 'var(--c-text)', lineHeight: '1.6' }}>
                {result.parts.header.json}
              </pre>
            </div>

            {/* Payload */}
            <div className="flex-1 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-purple)' }}>Payload</span>
                <CopyButton text={result.parts.payload.json} copyKey="payload" copied={copied} onCopy={copy} />
              </div>
              <pre className="px-4 py-3 text-xs font-mono overflow-x-auto" style={{ color: 'var(--c-text)', lineHeight: '1.6' }}>
                {result.parts.payload.json}
              </pre>
            </div>
          </div>

          {/* Signature */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-text)' }}>Signature</span>
                <span className="badge-warning">Not verified</span>
              </div>
              <CopyButton text={result.parts.signature} copyKey="sig" copied={copied} onCopy={copy} />
            </div>
            <div className="px-4 py-3">
              <code className="text-xs font-mono break-all" style={{ color: 'var(--c-text-5)' }}>
                {result.parts.signature}
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!token && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-3" style={{ opacity: 0.15, color: 'var(--c-text)' }}>JWT</div>
            <p className="text-sm font-mono" style={{ color: 'var(--c-text-3)' }}>
              Paste a JWT token above to decode it
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
