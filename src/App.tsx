import { useEffect, useCallback } from 'react'
import { Sidebar, type ToolId, TOOLS } from './components/Sidebar'
import { JsonFormatter } from './components/JsonFormatter'
import { Base64Tool } from './components/Base64Tool'
import { UuidGenerator } from './components/UuidGenerator'
import { HashGenerator } from './components/HashGenerator'
import { PasswordGenerator } from './components/PasswordGenerator'
import { JwtTool } from './components/JwtTool'
import { SqlFormatter } from './components/SqlFormatter'
import { useLocalStorage } from './hooks/useLocalStorage'

function ToolPanel({ active }: { active: ToolId }) {
  switch (active) {
    case 'json': return <JsonFormatter />
    case 'base64': return <Base64Tool />
    case 'uuid': return <UuidGenerator />
    case 'hash': return <HashGenerator />
    case 'password': return <PasswordGenerator />
    case 'jwt': return <JwtTool />
    case 'sql': return <SqlFormatter />
  }
}

const TOOL_TITLES: Record<ToolId, string> = {
  json: 'JSON Formatter',
  base64: 'Base64 Encoder / Decoder',
  uuid: 'UUID Generator',
  hash: 'Hash Generator',
  password: 'Password Generator',
  jwt: 'JWT Inspector',
  sql: 'SQL Formatter',
}

const TOOL_SUBTITLES: Record<ToolId, string> = {
  json: 'Validate, format, and minify JSON data',
  base64: 'Encode and decode Base64 strings in real time',
  uuid: 'Generate RFC 4122 v4 UUIDs using the Web Crypto API',
  hash: 'Compute MD5, SHA-1, SHA-256, and SHA-512 hashes instantly',
  password: 'Generate secure random passwords with configurable rules',
  jwt: 'Decode and inspect JWT tokens — header, payload, claims, and expiry',
  sql: 'Format and beautify SQL queries with dialect-aware syntax highlighting',
}

export default function App() {
  const [active, setActive] = useLocalStorage<ToolId>('devutils:active-tool', 'json')
  const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('devutils:theme', 'dark')

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  const handleSelect = useCallback((id: ToolId) => setActive(id), [])
  const handleToggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < TOOLS.length) {
        setActive(TOOLS[idx].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      <Sidebar active={active} onSelect={handleSelect} theme={theme} onToggleTheme={handleToggleTheme} />

      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header
          className="px-8 py-5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-bg)' }}
        >
          <h1 className="text-base font-semibold" style={{ color: 'var(--c-text)', letterSpacing: '-0.02em' }}>
            {TOOL_TITLES[active]}
          </h1>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {TOOL_SUBTITLES[active]}
          </p>
        </header>

        <div className="flex-1 min-h-0 overflow-auto px-8 py-6">
          <ToolPanel active={active} />
        </div>
      </main>
    </div>
  )
}
