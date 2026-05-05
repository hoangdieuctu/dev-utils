import { useEffect, useRef } from 'react'
import type React from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInputHistory } from '../hooks/useInputHistory'
import { InputHistory } from './InputHistory'

// --- ASN.1 / DER helpers (shared logic, duplicated to keep files self-contained) ---

interface AsnNode {
  tag: number
  constructed: boolean
  value: Uint8Array
  children?: AsnNode[]
}

function readLength(buf: Uint8Array, offset: number): { len: number; bytesRead: number } {
  const first = buf[offset]
  if (first < 0x80) return { len: first, bytesRead: 1 }
  const numBytes = first & 0x7f
  let len = 0
  for (let i = 0; i < numBytes; i++) len = (len << 8) | buf[offset + 1 + i]
  return { len, bytesRead: 1 + numBytes }
}

function parseAsn(buf: Uint8Array, offset = 0, end?: number): AsnNode[] {
  const nodes: AsnNode[] = []
  const limit = end ?? buf.length
  while (offset < limit) {
    const tag = buf[offset++]
    const { len, bytesRead } = readLength(buf, offset)
    offset += bytesRead
    const value = buf.slice(offset, offset + len)
    const constructed = !!(tag & 0x20)
    const node: AsnNode = { tag, constructed, value }
    if (constructed) node.children = parseAsn(value)
    nodes.push(node)
    offset += len
  }
  return nodes
}

function decodeOid(buf: Uint8Array): string {
  if (buf.length === 0) return ''
  const parts: number[] = []
  parts.push(Math.floor(buf[0] / 40), buf[0] % 40)
  let cur = 0
  for (let i = 1; i < buf.length; i++) {
    cur = (cur << 7) | (buf[i] & 0x7f)
    if (!(buf[i] & 0x80)) { parts.push(cur); cur = 0 }
  }
  return parts.join('.')
}

const OID_NAMES: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC (Elliptic Curve)',
  '1.3.101.110': 'X25519',
  '1.3.101.111': 'X448',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.10045.3.1.7': 'P-256 (prime256v1)',
  '1.3.132.0.34': 'P-384 (secp384r1)',
  '1.3.132.0.35': 'P-521 (secp521r1)',
  '1.3.132.0.10': 'secp256k1',
}

function oidName(dotted: string): string {
  return OID_NAMES[dotted] ?? dotted
}

// --- PEM helpers ---

type KeyFormat = 'rsa-traditional' | 'ec-traditional' | 'pkcs8' | 'unknown'

interface PemInfo {
  label: string
  der: Uint8Array
  format: KeyFormat
}

function pemToDer(pem: string, label: string): Uint8Array | null {
  const re = new RegExp(`-----BEGIN ${label}-----\\s*([\\s\\S]*?)\\s*-----END ${label}-----`)
  const match = pem.match(re)
  if (!match) return null
  try {
    const b64 = match[1].replace(/\s+/g, '')
    const bin = atob(b64)
    return Uint8Array.from(bin, c => c.charCodeAt(0))
  } catch { return null }
}

function detectPem(pem: string): PemInfo | null {
  const trimmed = pem.trim()

  let der = pemToDer(trimmed, 'RSA PRIVATE KEY')
  if (der) return { label: 'RSA PRIVATE KEY', der, format: 'rsa-traditional' }

  der = pemToDer(trimmed, 'EC PRIVATE KEY')
  if (der) return { label: 'EC PRIVATE KEY', der, format: 'ec-traditional' }

  der = pemToDer(trimmed, 'PRIVATE KEY')
  if (der) return { label: 'PRIVATE KEY', der, format: 'pkcs8' }

  return null
}

// --- Key parsing ---

export interface ParsedKey {
  type: string           // "RSA", "EC (P-256)", "Ed25519", etc.
  format: string         // "PKCS#1 (Traditional)", "SEC1 (Traditional)", "PKCS#8"
  keyBits?: number       // RSA modulus bits
  curve?: string         // EC curve name
  publicKeyFingerprint: { sha256: string; sha1: string }
  publicKeyHex: string   // first 32 bytes of raw public key, hex
}

async function fingerprintSpki(spkiDer: Uint8Array): Promise<{ sha256: string; sha1: string }> {
  const buf = spkiDer.buffer.slice(spkiDer.byteOffset, spkiDer.byteOffset + spkiDer.byteLength) as ArrayBuffer
  const [s256, s1] = await Promise.all([
    crypto.subtle.digest('SHA-256', buf),
    crypto.subtle.digest('SHA-1', buf),
  ])
  const fmt = (ab: ArrayBuffer) => Array.from(new Uint8Array(ab)).map(b => b.toString(16).padStart(2, '0')).join(':')
  return { sha256: fmt(s256), sha1: fmt(s1) }
}

function hexOf(buf: Uint8Array, maxBytes = buf.length): string {
  return Array.from(buf.slice(0, maxBytes)).map(b => b.toString(16).padStart(2, '0')).join(':')
}

// Build a minimal SPKI DER from RSA public key components (modulus + exponent)
function buildRsaSpki(modulusDer: Uint8Array, exponentDer: Uint8Array): Uint8Array {
  // RSAPublicKey SEQUENCE { modulus INTEGER, publicExponent INTEGER }
  function encodeInt(val: Uint8Array): Uint8Array {
    const needsPad = val[0] & 0x80
    const body = needsPad ? new Uint8Array([0, ...val]) : val
    return encodeNode(0x02, body)
  }
  function encodeLen(len: number): Uint8Array {
    if (len < 0x80) return new Uint8Array([len])
    if (len < 0x100) return new Uint8Array([0x81, len])
    return new Uint8Array([0x82, len >> 8, len & 0xff])
  }
  function encodeNode(tag: number, body: Uint8Array): Uint8Array {
    return new Uint8Array([tag, ...encodeLen(body.length), ...body])
  }

  const rsaPubKey = encodeNode(0x30, new Uint8Array([...encodeInt(modulusDer), ...encodeInt(exponentDer)]))
  // BIT STRING: 0x00 unused bits + DER
  const bitString = encodeNode(0x03, new Uint8Array([0x00, ...rsaPubKey]))
  // AlgorithmIdentifier: OID rsaEncryption + NULL
  const rsaOidBytes = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])
  const algId = encodeNode(0x30, new Uint8Array([...encodeNode(0x06, rsaOidBytes), 0x05, 0x00]))
  return encodeNode(0x30, new Uint8Array([...algId, ...bitString]))
}

async function parseRsaTraditional(der: Uint8Array): Promise<ParsedKey> {
  // RSAPrivateKey ::= SEQUENCE { version, modulus, publicExponent, ... }
  const seq = parseAsn(der)[0]?.children ?? []
  const modulus = seq[1]?.value  // INTEGER modulus
  const exponent = seq[2]?.value // INTEGER publicExponent

  let keyBits: number | undefined
  let publicKeyFingerprint = { sha256: '', sha1: '' }
  let publicKeyHex = ''

  if (modulus && exponent) {
    const bytes = modulus[0] === 0 ? modulus.length - 1 : modulus.length
    keyBits = bytes * 8
    publicKeyHex = hexOf(modulus[0] === 0 ? modulus.slice(1) : modulus, 32)
    try {
      const spki = buildRsaSpki(modulus, exponent)
      publicKeyFingerprint = await fingerprintSpki(spki)
    } catch { /* ignore */ }
  }

  return { type: 'RSA', format: 'PKCS#1 (Traditional)', keyBits, publicKeyFingerprint, publicKeyHex }
}

async function parseEcTraditional(der: Uint8Array): Promise<ParsedKey> {
  // ECPrivateKey ::= SEQUENCE { version, privateKey OCTET STRING, [0] parameters OID, [1] publicKey BIT STRING }
  const seq = parseAsn(der)[0]?.children ?? []
  let curve = ''
  let publicKeyHex = ''
  let publicKeyFingerprint = { sha256: '', sha1: '' }

  for (const node of seq) {
    if (node.tag === 0xa0) {
      // parameters: OID
      const oid = decodeOid(node.children?.[0]?.value ?? new Uint8Array())
      curve = oidName(oid)
    }
    if (node.tag === 0xa1) {
      // publicKey: BIT STRING (first byte = unused bits)
      const bs = node.children?.[0]
      if (bs?.tag === 0x03) {
        const rawPub = bs.value.slice(1)
        publicKeyHex = hexOf(rawPub, 32)
        // We can't easily reconstruct full SPKI without the curve OID bytes inline,
        // so fingerprint the raw public key bytes directly
        try {
          const buf = rawPub.buffer.slice(rawPub.byteOffset, rawPub.byteOffset + rawPub.byteLength) as ArrayBuffer
          const [s256, s1] = await Promise.all([
            crypto.subtle.digest('SHA-256', buf),
            crypto.subtle.digest('SHA-1', buf),
          ])
          const fmt = (ab: ArrayBuffer) => Array.from(new Uint8Array(ab)).map(b => b.toString(16).padStart(2, '0')).join(':')
          publicKeyFingerprint = { sha256: fmt(s256), sha1: fmt(s1) }
        } catch { /* ignore */ }
      }
    }
  }

  return { type: `EC${curve ? ` (${curve})` : ''}`, format: 'SEC1 (Traditional)', curve, publicKeyFingerprint, publicKeyHex }
}

async function parsePkcs8(der: Uint8Array): Promise<ParsedKey> {
  // PrivateKeyInfo ::= SEQUENCE { version, AlgorithmIdentifier, privateKey OCTET STRING }
  const seq = parseAsn(der)[0]?.children ?? []
  const algSeq = seq[1]?.children ?? []
  const algOidNode = algSeq[0]
  const paramOidNode = algSeq[1]

  const algDotted = algOidNode ? decodeOid(algOidNode.value) : ''
  const algName = oidName(algDotted)

  let type = algName
  let curve = ''
  let keyBits: number | undefined
  let publicKeyFingerprint = { sha256: '', sha1: '' }
  let publicKeyHex = ''

  if (algDotted === '1.2.840.113549.1.1.1') {
    // RSA: inner OCTET STRING contains RSAPrivateKey
    const innerDer = seq[2]?.value
    if (innerDer) {
      const inner = parseAsn(innerDer)[0]?.children ?? []
      const modulus = inner[1]?.value
      const exponent = inner[2]?.value
      if (modulus && exponent) {
        const bytes = modulus[0] === 0 ? modulus.length - 1 : modulus.length
        keyBits = bytes * 8
        publicKeyHex = hexOf(modulus[0] === 0 ? modulus.slice(1) : modulus, 32)
        try {
          const spki = buildRsaSpki(modulus, exponent)
          publicKeyFingerprint = await fingerprintSpki(spki)
        } catch { /* ignore */ }
      }
    }
    type = 'RSA'
  } else if (algDotted === '1.2.840.10045.2.1') {
    // EC: param OID is the curve
    if (paramOidNode?.tag === 0x06) {
      const curveDotted = decodeOid(paramOidNode.value)
      curve = oidName(curveDotted)
      type = `EC (${curve})`
    }
    // Try to extract public key from inner ECPrivateKey
    const innerDer = seq[2]?.value
    if (innerDer) {
      const inner = parseAsn(innerDer)[0]?.children ?? []
      for (const node of inner) {
        if (node.tag === 0xa1) {
          const bs = node.children?.[0]
          if (bs?.tag === 0x03) {
            const rawPub = bs.value.slice(1)
            publicKeyHex = hexOf(rawPub, 32)
            try {
              const buf = rawPub.buffer.slice(rawPub.byteOffset, rawPub.byteOffset + rawPub.byteLength) as ArrayBuffer
              const [s256, s1] = await Promise.all([
                crypto.subtle.digest('SHA-256', buf),
                crypto.subtle.digest('SHA-1', buf),
              ])
              const fmt = (ab: ArrayBuffer) => Array.from(new Uint8Array(ab)).map(b => b.toString(16).padStart(2, '0')).join(':')
              publicKeyFingerprint = { sha256: fmt(s256), sha1: fmt(s1) }
            } catch { /* ignore */ }
          }
        }
      }
    }
  } else if (['1.3.101.112', '1.3.101.113', '1.3.101.110', '1.3.101.111'].includes(algDotted)) {
    // EdDSA / X25519 / X448: public key may be in [1] context tag of inner CurvePrivateKey
    type = oidName(algDotted)
    const innerDer = seq[2]?.value
    if (innerDer) {
      // CurvePrivateKey ::= OCTET STRING (just the scalar bytes, wrapped in another OCTET STRING)
      const inner = parseAsn(innerDer)
      if (inner[0]?.tag === 0x04) {
        publicKeyHex = hexOf(inner[0].value, 32)
      }
    }
    // public key fingerprint from the raw PKCS#8 DER (common approach for EdDSA)
    try {
      publicKeyFingerprint = await fingerprintSpki(der)
    } catch { /* ignore */ }
  }

  return { type, format: 'PKCS#8', curve, keyBits, publicKeyFingerprint, publicKeyHex }
}

async function parsePrivateKey(pem: string): Promise<ParsedKey> {
  const info = detectPem(pem)
  if (!info) throw new Error('No recognized private key PEM header found.\nSupported: RSA PRIVATE KEY, EC PRIVATE KEY, PRIVATE KEY (PKCS#8)')

  switch (info.format) {
    case 'rsa-traditional': return parseRsaTraditional(info.der)
    case 'ec-traditional':  return parseEcTraditional(info.der)
    case 'pkcs8':           return parsePkcs8(info.der)
    default: throw new Error('Unknown key format')
  }
}

// --- UI ---

function InfoRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <tr className="border-b last:border-0" style={{ borderColor: 'var(--c-border-subtle)' }}>
      <td className="px-4 py-2 w-44 flex-shrink-0 text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>{label}</td>
      <td className={`px-4 py-2 text-xs break-all ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--c-text)' }}>{value}</td>
    </tr>
  )
}

function Section({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
      <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
        <span className="text-xs font-mono font-semibold" style={{ color: accent ?? 'var(--c-text)' }}>{title}</span>
      </div>
      <table className="w-full"><tbody>{children}</tbody></table>
    </div>
  )
}

const SAMPLE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIOaXDwIBADN4r+HZiJXqzFjXFGBBxGAIVm0kJwm/Xrr5oAoGCCqGSM49
AwEHoWQDYgAEw8sB5atIozwUwfSgHVsvkTplQx8eZAW8WLk2tOqDukMm1fknkxFW
dLYkGoETRVScwiPEyoOT9wGZPUcxhI7G
-----END EC PRIVATE KEY-----`

export function PrivateKeyTool() {
  const [input, setInput] = useLocalStorage('devutils:privkey:input', '')
  const [result, setResult] = useLocalStorage<ParsedKey | null>('devutils:privkey:parsed', null)
  const [error, setError] = useLocalStorage<string>('devutils:privkey:error', '')
  const { copied, copy } = useCopy()
  const { history, pushHistory, clearHistory } = useInputHistory('devutils:privkey:history')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const trimmed = input.trim()
      if (!trimmed) { setResult(null); setError(''); return }
      try {
        const parsed = await parsePrivateKey(trimmed)
        setResult(parsed)
        setError('')
        pushHistory(trimmed)
      } catch (e) {
        setResult(null)
        setError((e as Error).message)
      }
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [input])

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in" style={{ overflowY: 'auto' }}>
      {/* Input */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="section-label">Private Key (PEM)</span>
          <div className="flex items-center gap-2">
            <InputHistory history={history} onSelect={setInput} onClear={clearHistory} />
            {input && <button onClick={() => { setInput(''); setResult(null); setError('') }} className="tool-btn text-xs">Clear</button>}
            <button onClick={() => setInput(SAMPLE_KEY)} className="tool-btn text-xs">Load sample</button>
          </div>
        </div>
        <textarea
          className="tool-textarea"
          rows={6}
          placeholder="Paste a PEM private key (RSA PRIVATE KEY, EC PRIVATE KEY, or PRIVATE KEY)"
          value={input}
          onChange={e => setInput(e.target.value)}
          spellCheck={false}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', wordBreak: 'break-all' }}
        />
        <p className="text-xs font-mono" style={{ color: 'var(--c-text-4)' }}>
          The private scalar/exponent is never displayed. All processing stays in your browser.
        </p>
      </div>

      {error && <div className="error-block flex-shrink-0" style={{ whiteSpace: 'pre-line' }}>{error}</div>}

      {result && (
        <div className="flex flex-col gap-3 flex-shrink-0">
          {/* Summary */}
          <div className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
            <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-text)' }}>{result.type}</span>
            {result.keyBits && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{ color: 'var(--c-accent-2)', background: 'rgba(92,108,250,0.1)', border: '1px solid rgba(92,108,250,0.2)' }}>
                {result.keyBits} bits
              </span>
            )}
            <span className="text-xs font-mono px-1.5 py-0.5 rounded ml-auto"
              style={{ color: 'var(--c-text-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
              {result.format}
            </span>
          </div>

          {/* Key info */}
          <Section title="Key Info" accent="var(--c-accent-2)">
            <InfoRow label="Algorithm" value={result.type} mono={false} />
            <InfoRow label="Format" value={result.format} mono={false} />
            {result.keyBits && <InfoRow label="Key Size" value={`${result.keyBits} bits`} />}
            {result.curve && <InfoRow label="Curve" value={result.curve} mono={false} />}
            {result.publicKeyHex && (
              <InfoRow label="Public Key (prefix)" value={
                <span className="flex items-center gap-2">
                  <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{result.publicKeyHex}…</span>
                  <CopyButton text={result.publicKeyHex} copyKey="pubhex" copied={copied} onCopy={copy} />
                </span>
              } />
            )}
          </Section>

          {/* Fingerprints */}
          {(result.publicKeyFingerprint.sha256 || result.publicKeyFingerprint.sha1) && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
              <div className="px-4 py-2.5 border-b flex items-center justify-between"
                style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-text)' }}>Public Key Fingerprint</span>
                <span className="text-xs font-mono" style={{ color: 'var(--c-text-4)' }}>use to match against a certificate</span>
              </div>
              <table className="w-full"><tbody>
                {result.publicKeyFingerprint.sha256 && (
                  <tr className="border-b" style={{ borderColor: 'var(--c-border-subtle)' }}>
                    <td className="px-4 py-2 w-44 text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>SHA-256</td>
                    <td className="px-4 py-2 text-xs font-mono break-all" style={{ color: 'var(--c-text)' }}>
                      <span className="flex items-center gap-2">
                        <span>{result.publicKeyFingerprint.sha256}</span>
                        <CopyButton text={result.publicKeyFingerprint.sha256} copyKey="kfp256" copied={copied} onCopy={copy} />
                      </span>
                    </td>
                  </tr>
                )}
                {result.publicKeyFingerprint.sha1 && (
                  <tr>
                    <td className="px-4 py-2 w-44 text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>SHA-1</td>
                    <td className="px-4 py-2 text-xs font-mono break-all" style={{ color: 'var(--c-text)' }}>
                      <span className="flex items-center gap-2">
                        <span>{result.publicKeyFingerprint.sha1}</span>
                        <CopyButton text={result.publicKeyFingerprint.sha1} copyKey="kfp1" copied={copied} onCopy={copy} />
                      </span>
                    </td>
                  </tr>
                )}
              </tbody></table>
            </div>
          )}

          {/* Safety note */}
          <div className="rounded-xl border px-4 py-3 flex items-start gap-3 flex-shrink-0"
            style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-surface)' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--c-text-4)', flexShrink: 0, marginTop: 1 }}>
              <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--c-text-4)' }}>
              Private key material (the scalar / exponent) is never extracted or displayed. Only metadata and the derived public key fingerprint are shown.
            </p>
          </div>
        </div>
      )}

      {!input && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-3" style={{ opacity: 0.15, color: 'var(--c-text)' }}>KEY</div>
            <p className="text-sm font-mono" style={{ color: 'var(--c-text-3)' }}>
              Paste a PEM private key above to inspect it
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
