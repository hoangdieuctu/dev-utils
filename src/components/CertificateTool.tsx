import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useCopy } from '../hooks/useCopy'
import { CopyButton } from './CopyButton'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInputHistory } from '../hooks/useInputHistory'
import { InputHistory } from './InputHistory'

// --- ASN.1 / DER parser (minimal, sufficient for X.509) ---

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

function asnStr(node: AsnNode): string {
  // UTF8String, PrintableString, IA5String, BMPString, TeletexString, UniversalString
  if ([0x0c, 0x13, 0x16, 0x1e, 0x14, 0x1c].includes(node.tag)) {
    try { return new TextDecoder('utf-8').decode(node.value) } catch { /* fall through */ }
  }
  return Array.from(node.value).map(b => String.fromCharCode(b)).join('')
}

function hexOf(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(':')
}

function base64Of(buf: Uint8Array): string {
  let bin = ''
  buf.forEach(b => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

// OID lookup table (common X.509 OIDs)
const OID_MAP: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.9': 'STREET',
  '2.5.4.17': 'POSTALCODE',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.35': 'authorityKeyIdentifier',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.15': 'keyUsage',
  '2.5.29.37': 'extendedKeyUsage',
  '2.5.29.31': 'cRLDistributionPoints',
  '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',
  '2.5.29.32': 'certificatePolicies',
  '1.2.840.113549.1.1.1': 'rsaEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.10045.2.1': 'ecPublicKey',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.2.840.10045.3.1.7': 'prime256v1 (P-256)',
  '1.3.132.0.34': 'secp384r1 (P-384)',
  '1.3.132.0.35': 'secp521r1 (P-521)',
  '1.3.101.112': 'Ed25519',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
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
  const dotted = parts.join('.')
  return OID_MAP[dotted] ? `${OID_MAP[dotted]} (${dotted})` : dotted
}

function parseUtcTime(buf: Uint8Array): Date {
  const s = new TextDecoder().decode(buf).replace('Z', '')
  // YYMMDDHHMMSS — two-digit year
  const yr = parseInt(s.slice(0, 2))
  const year = yr >= 50 ? 1900 + yr : 2000 + yr
  return new Date(Date.UTC(year, parseInt(s.slice(2, 4)) - 1, parseInt(s.slice(4, 6)),
    parseInt(s.slice(6, 8)), parseInt(s.slice(8, 10)), parseInt(s.slice(10, 12))))
}

function parseGeneralizedTime(buf: Uint8Array): Date {
  const s = new TextDecoder().decode(buf).replace('Z', '')
  return new Date(Date.UTC(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)),
    parseInt(s.slice(8, 10)), parseInt(s.slice(10, 12)), parseInt(s.slice(12, 14))))
}

function parseDate(node: AsnNode): Date {
  if (node.tag === 0x17) return parseUtcTime(node.value)
  return parseGeneralizedTime(node.value)
}

function parseRdn(rdnSeq: AsnNode): string {
  const parts: string[] = []
  for (const rdn of rdnSeq.children ?? []) {
    for (const atv of rdn.children ?? []) {
      const [oidNode, valNode] = atv.children ?? []
      if (!oidNode || !valNode) continue
      const oid = decodeOid(oidNode.value)
      const label = oid.split(' ')[0]
      parts.push(`${label}=${asnStr(valNode)}`)
    }
  }
  return parts.join(', ')
}

// --- Parsed certificate structure ---

export interface ParsedCert {
  version: number
  serialNumber: string
  subject: string
  issuer: string
  notBefore: Date
  notAfter: Date
  signatureAlgorithm: string
  publicKeyAlgorithm: string
  publicKeyBits?: number
  subjectAltNames: string[]
  fingerprints: { sha256: string; sha1: string }
  isCA: boolean
  keyUsage: string[]
  extendedKeyUsage: string[]
  rawDer: Uint8Array
}

const EKU_MAP: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Time Stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
}

const KEY_USAGE_BITS = [
  'digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment',
  'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly',
]

async function computeFingerprints(der: Uint8Array): Promise<{ sha256: string; sha1: string }> {
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer
  const [s256, s1] = await Promise.all([
    crypto.subtle.digest('SHA-256', buf),
    crypto.subtle.digest('SHA-1', buf),
  ])
  const fmt = (ab: ArrayBuffer) => Array.from(new Uint8Array(ab)).map(b => b.toString(16).padStart(2, '0')).join(':')
  return { sha256: fmt(s256), sha1: fmt(s1) }
}

function getOidLabel(dotted: string): string {
  return OID_MAP[dotted] ?? dotted
}

async function parseCert(der: Uint8Array): Promise<ParsedCert> {
  const root = parseAsn(der)
  // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
  const cert = root[0]
  const [tbs, sigAlgNode] = cert.children ?? []

  const tbsChildren = tbs.children ?? []
  let idx = 0

  // Optional version [0] EXPLICIT
  let version = 1
  if (tbsChildren[idx].tag === 0xa0) {
    version = (tbsChildren[idx].children?.[0]?.value[0] ?? 0) + 1
    idx++
  }

  const serialNode = tbsChildren[idx++]
  const serial = hexOf(serialNode.value).replace(/^(00:)+/, '')

  const sigAlgTbs = tbsChildren[idx++]
  const sigAlgOidNode = sigAlgTbs.children?.[0]
  const sigAlg = sigAlgOidNode ? getOidLabel(decodeOid(sigAlgOidNode.value).split(' ')[0].replace(/[^0-9.]/g, '') || decodeOid(sigAlgOidNode.value)) : '?'

  const issuerNode = tbsChildren[idx++]
  const issuer = parseRdn(issuerNode)

  const validity = tbsChildren[idx++]
  const notBefore = parseDate((validity.children ?? [])[0])
  const notAfter = parseDate((validity.children ?? [])[1])

  const subjectNode = tbsChildren[idx++]
  const subject = parseRdn(subjectNode)

  const spki = tbsChildren[idx++]
  const spkiAlgNode = spki.children?.[0]?.children?.[0]
  const pkAlgDotted = spkiAlgNode ? (() => {
    const raw = decodeOid(spkiAlgNode.value)
    return raw.split(' ')[0].replace(/[^0-9.]/g, '') || raw
  })() : ''
  const publicKeyAlgorithm = spkiAlgNode ? getOidLabel(pkAlgDotted) : '?'

  // For RSA, extract modulus length
  let publicKeyBits: number | undefined
  const pkBitString = spki.children?.[1]
  if (pkBitString && OID_MAP[pkAlgDotted]?.startsWith('rsa')) {
    try {
      // BitString: first byte is unused-bits count, rest is DER RSAPublicKey
      const rsaDer = pkBitString.value.slice(1)
      const rsaNodes = parseAsn(rsaDer)
      const modulus = rsaNodes[0]?.children?.[0]
      if (modulus) {
        const bytes = modulus.value[0] === 0 ? modulus.value.length - 1 : modulus.value.length
        publicKeyBits = bytes * 8
      }
    } catch { /* ignore */ }
  }

  // Extensions [3]
  let subjectAltNames: string[] = []
  let isCA = false
  let keyUsage: string[] = []
  let extendedKeyUsage: string[] = []

  for (; idx < tbsChildren.length; idx++) {
    if (tbsChildren[idx].tag === 0xa3) {
      const exts = tbsChildren[idx].children?.[0]?.children ?? []
      for (const ext of exts) {
        const extChildren = ext.children ?? []
        const oidNode = extChildren[0]
        if (!oidNode) continue
        const oidDotted = (() => {
          const raw = decodeOid(oidNode.value)
          return raw.includes('(') ? raw.split('(')[1].replace(')', '') : raw
        })()

        // Find the OCTET STRING value (last child, skip critical BOOLEAN)
        const octetNode = extChildren[extChildren.length - 1]
        if (!octetNode || octetNode.tag !== 0x04) continue
        const extVal = parseAsn(octetNode.value)

        if (oidDotted === '2.5.29.17') {
          // SAN
          for (const sanEntry of extVal[0]?.children ?? []) {
            const tagType = sanEntry.tag & 0x1f
            if (tagType === 2) subjectAltNames.push(`DNS:${new TextDecoder().decode(sanEntry.value)}`)
            else if (tagType === 7) subjectAltNames.push(`IP:${Array.from(sanEntry.value).join('.')}`)
            else if (tagType === 1) subjectAltNames.push(`email:${new TextDecoder().decode(sanEntry.value)}`)
          }
        } else if (oidDotted === '2.5.29.19') {
          // basicConstraints
          const seq = extVal[0]?.children ?? []
          isCA = seq.some(n => n.tag === 0x01 && n.value[0] === 0xff)
        } else if (oidDotted === '2.5.29.15') {
          // keyUsage - BitString
          const bits = extVal[0]
          if (bits?.tag === 0x03 && bits.value.length >= 2) {
            const unusedBits = bits.value[0]
            const byte1 = bits.value[1]
            for (let i = 0; i < 8 - unusedBits; i++) {
              if (byte1 & (0x80 >> i)) keyUsage.push(KEY_USAGE_BITS[i])
            }
          }
        } else if (oidDotted === '2.5.29.37') {
          // extendedKeyUsage
          for (const ekuOid of extVal[0]?.children ?? []) {
            const dotted = (() => {
              const raw = decodeOid(ekuOid.value)
              return raw.includes('(') ? raw.split('(')[1].replace(')', '') : raw
            })()
            extendedKeyUsage.push(EKU_MAP[dotted] ?? dotted)
          }
        }
      }
    }
  }

  const sigAlgFull = (() => {
    const sigOid = sigAlgNode?.children?.[0]
    if (!sigOid) return sigAlg
    const raw = decodeOid(sigOid.value)
    return raw.includes('(') ? raw.split('(')[0].trim() : raw
  })()

  const fingerprints = await computeFingerprints(der)

  return {
    version,
    serialNumber: serial,
    subject,
    issuer,
    notBefore,
    notAfter,
    signatureAlgorithm: sigAlgFull,
    publicKeyAlgorithm,
    publicKeyBits,
    subjectAltNames,
    fingerprints,
    isCA,
    keyUsage,
    extendedKeyUsage,
    rawDer: der,
  }
}

function pemToDer(pem: string): Uint8Array | null {
  const match = pem.match(/-----BEGIN CERTIFICATE-----\s*([\s\S]*?)\s*-----END CERTIFICATE-----/)
  if (!match) return null
  try {
    const b64 = match[1].replace(/\s+/g, '')
    const bin = atob(b64)
    return Uint8Array.from(bin, c => c.charCodeAt(0))
  } catch {
    return null
  }
}

// --- UI components ---

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) + ` (UTC)`
}

function ValidityBadge({ notBefore, notAfter }: { notBefore: Date; notAfter: Date }) {
  const now = new Date()
  if (now < notBefore) return <span className="badge-warning ml-2">Not yet valid</span>
  if (now > notAfter) {
    const ago = Math.round((now.getTime() - notAfter.getTime()) / 86400000)
    return <span className="badge-error ml-2">Expired {ago}d ago</span>
  }
  const daysLeft = Math.round((notAfter.getTime() - now.getTime()) / 86400000)
  return <span className="badge-success ml-2">Valid · {daysLeft}d remaining</span>
}

function InfoRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <tr className="border-b last:border-0" style={{ borderColor: 'var(--c-border-subtle)' }}>
      <td className="px-4 py-2 w-40 flex-shrink-0 text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>{label}</td>
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

const SAMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIIBvTCCAWOgAwIBAgIUYlEaKkEjPdNV9UcBTbBPJJdF8n8wCgYIKoZIzj0EAwIw
ITEfMB0GA1UEAxMWRGV2VXRpbHMgU2FtcGxlIFJvb3QgQ0EwHhcNMjQwMTAxMDAw
MDAwWhcNMjUwMTAxMDAwMDAwWjAhMR8wHQYDVQQDExZEZXZVdGlscyBTYW1wbGUg
Um9vdCBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABMPLAeWrSKM8FMH0oB1b
L5E6ZUMfHmQFvFi5NrTqg7pDJtX5J5MRVnS2JBqBE0VUnMIjxMqDk/cBmT1HMYS
jgaMwgaAwHQYDVR0OBBYEFBjgRq82q7mW6O2y9S8EIWRXnMFKMB8GA1UdIwQYMBaA
FBjgRq82q7mW6O2y9S8EIWRXnMFKMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgGGMC0GA1UdEQQmMCSCDGRldnV0aWxzLmFwcIIUd3d3LmRldnV0aWxzLmFw
cAIKMAoGCCqGSM49BAMCA0gAMEUCIBpYSZmwm7oD4cTFHAlHEcVi+lDqzb8HMFAM
b0Cx7CY5AiEAoQ8EiCiWH8E0kT3pKH7vdp5cpevElkK8dW6Z/3A8bLQ=
-----END CERTIFICATE-----`

export function CertificateTool() {
  const [input, setInput] = useLocalStorage('devutils:cert:input', '')
  const [cert, setCert] = useState<ParsedCert | null>(null)
  const [error, setError] = useState<string>('')
  const { copied, copy } = useCopy()
  const { history, pushHistory, clearHistory } = useInputHistory('devutils:cert:history')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear stale serialized cert/error keys that may contain unserializable data
  useEffect(() => {
    localStorage.removeItem('devutils:cert:parsed')
    localStorage.removeItem('devutils:cert:error')
  }, [])

  async function processPem(pem: string) {
    const trimmed = pem.trim()
    if (!trimmed) { setCert(null); setError(''); return }
    const der = pemToDer(trimmed)
    if (!der) { setCert(null); setError('Could not find a valid PEM-encoded certificate (-----BEGIN CERTIFICATE-----)'); return }
    try {
      const parsed = await parseCert(der)
      setCert(parsed)
      setError('')
    } catch (e) {
      setCert(null)
      setError(`Parse error: ${(e as Error).message}`)
    }
  }

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      processPem(input)
      if (input.trim()) pushHistory(input)
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [input])

  const derB64 = cert ? base64Of(cert.rawDer) : ''

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in" style={{ overflowY: 'auto' }}>
      {/* Input */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="section-label">PEM Certificate</span>
          <div className="flex items-center gap-2">
            <InputHistory history={history} onSelect={setInput} onClear={clearHistory} />
            {input && <button onClick={() => { setInput(''); setCert(null); setError('') }} className="tool-btn text-xs">Clear</button>}
            <button onClick={() => setInput(SAMPLE_CERT)} className="tool-btn text-xs">Load sample</button>
            <CopyButton text={input} copyKey="pem" copied={copied} onCopy={copy} label="Copy PEM" />
          </div>
        </div>
        <textarea
          className="tool-textarea"
          rows={5}
          placeholder="Paste a PEM certificate (-----BEGIN CERTIFICATE-----)"
          value={input}
          onChange={e => setInput(e.target.value)}
          spellCheck={false}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', wordBreak: 'break-all' }}
        />
      </div>

      {error && <div className="error-block flex-shrink-0">{error}</div>}

      {cert && (
        <div className="flex flex-col gap-3 flex-shrink-0">
          {/* Summary bar */}
          <div className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
            <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-text)' }}>
              {cert.subject.match(/CN=([^,]+)/)?.[1] ?? cert.subject}
            </span>
            <ValidityBadge notBefore={cert.notBefore} notAfter={cert.notAfter} />
            {cert.isCA && <span className="badge-warning">CA</span>}
            <span className="text-xs font-mono px-1.5 py-0.5 rounded ml-auto"
              style={{ color: 'var(--c-text-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
              v{cert.version}
            </span>
          </div>

          {/* Subject & Issuer */}
          <div className="flex gap-3">
            <Section title="Subject" accent="var(--c-accent-2)">
              {cert.subject.split(', ').map(part => {
                const [k, ...rest] = part.split('=')
                return <InfoRow key={k} label={k} value={rest.join('=')} />
              })}
            </Section>
            <Section title="Issuer" accent="var(--c-purple)">
              {cert.issuer.split(', ').map(part => {
                const [k, ...rest] = part.split('=')
                return <InfoRow key={k} label={k} value={rest.join('=')} />
              })}
            </Section>
          </div>

          {/* Validity */}
          <Section title="Validity">
            <InfoRow label="Not Before" value={formatDate(cert.notBefore)} />
            <InfoRow label="Not After" value={<span className="flex items-center gap-1">{formatDate(cert.notAfter)}<ValidityBadge notBefore={cert.notBefore} notAfter={cert.notAfter} /></span>} />
          </Section>

          {/* Public Key */}
          <Section title="Public Key">
            <InfoRow label="Algorithm" value={cert.publicKeyAlgorithm} />
            {cert.publicKeyBits && <InfoRow label="Key Size" value={`${cert.publicKeyBits} bits`} />}
            <InfoRow label="Signature Alg" value={cert.signatureAlgorithm} />
          </Section>

          {/* SAN */}
          {cert.subjectAltNames.length > 0 && (
            <Section title="Subject Alternative Names">
              {cert.subjectAltNames.map((san, i) => (
                <InfoRow key={i} label={san.split(':')[0]} value={san.split(':').slice(1).join(':')} />
              ))}
            </Section>
          )}

          {/* Key Usage */}
          {(cert.keyUsage.length > 0 || cert.extendedKeyUsage.length > 0) && (
            <Section title="Key Usage">
              {cert.keyUsage.length > 0 && <InfoRow label="Key Usage" value={cert.keyUsage.join(', ')} />}
              {cert.extendedKeyUsage.length > 0 && <InfoRow label="Extended Key Usage" value={cert.extendedKeyUsage.join(', ')} mono={false} />}
            </Section>
          )}

          {/* Fingerprints */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg-elevated)' }}>
              <span className="text-xs font-mono font-semibold" style={{ color: 'var(--c-text)' }}>Fingerprints</span>
            </div>
            <table className="w-full"><tbody>
              <tr className="border-b" style={{ borderColor: 'var(--c-border-subtle)' }}>
                <td className="px-4 py-2 w-40 text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>SHA-256</td>
                <td className="px-4 py-2 text-xs font-mono break-all flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  <span>{cert.fingerprints.sha256}</span>
                  <CopyButton text={cert.fingerprints.sha256} copyKey="fp256" copied={copied} onCopy={copy} />
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 w-40 text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>SHA-1</td>
                <td className="px-4 py-2 text-xs font-mono break-all flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  <span>{cert.fingerprints.sha1}</span>
                  <CopyButton text={cert.fingerprints.sha1} copyKey="fp1" copied={copied} onCopy={copy} />
                </td>
              </tr>
            </tbody></table>
          </div>

          {/* Serial + DER export */}
          <Section title="Details">
            <InfoRow label="Serial Number" value={
              <span className="flex items-center gap-2">
                {cert.serialNumber}
                <CopyButton text={cert.serialNumber} copyKey="serial" copied={copied} onCopy={copy} />
              </span>
            } />
            <InfoRow label="DER (base64)" value={
              <span className="flex items-center gap-2">
                <span className="truncate max-w-xs">{derB64.slice(0, 48)}…</span>
                <CopyButton text={derB64} copyKey="der" copied={copied} onCopy={copy} label="Copy DER" />
              </span>
            } />
          </Section>
        </div>
      )}

      {!input && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-3" style={{ opacity: 0.15, color: 'var(--c-text)' }}>X.509</div>
            <p className="text-sm font-mono" style={{ color: 'var(--c-text-3)' }}>
              Paste a PEM certificate above to decode it
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
